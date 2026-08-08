/* Refreshes data/events.json from WPCNA's self-updating city-calendar feed.
 *
 * WPCNA scrapes the official White Plains city calendar nightly into
 * src/_data/events.{json,auto.json} in its public repo. This pulls that
 * already-refreshed output, keeps upcoming events, and reformats them into the
 * FHA card shape. Runs in CI on a schedule (see .github/workflows/update-events.yml).
 *
 * Plain Node 20+ (global fetch). No dependencies.
 *   node scripts/update-events.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../data/events.json", import.meta.url));

// WPCNA's live repo — the one that builds wp-cna.org. Change WP_REPO if it moves.
const WP_REPO = "wp-cna/demo14";
const BASE = `https://raw.githubusercontent.com/${WP_REPO}/main/src/_data/`;
const SOURCES = ["events.json", "events.auto.json"]; // curated first, then auto-scraped

const MON = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CITY_TEMPLATE = /listed on the official White Plains city calendar/i;

function dlabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MON[m - 1]} ${d}, ${y}`;
}
function t12(t) {
  if (!t) return "";
  const [h, mn] = t.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM", hh = h % 12 || 12;
  return `${hh}:${String(mn).padStart(2, "0")} ${ap}`;
}
function tlabel(s, e) { const a = t12(s), b = t12(e); return a && b ? `${a} – ${b}` : (a || ""); }

// The city-calendar summaries are templated, so we can give a Spanish version cheaply.
function summaryEs(title, summary) {
  if (!CITY_TEMPLATE.test(summary || "")) return null;
  return `${title} aparece en el calendario oficial de la ciudad de White Plains. Está programado en White Plains, NY. Consulte la página oficial de la ciudad para agendas, actualizaciones y cambios de ubicación.`;
}

/* Upstream ships each source either as a bare array or wrapped in an object
   ({ events: [...] }, as the curated feed has been since the events page was
   expanded). Accept both so a future reshape degrades to a skipped source
   rather than a crash that quietly freezes the feed. */
export function asEventArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of ["events", "items", "data"]) if (Array.isArray(raw[k])) return raw[k];
  }
  return null;
}

export function toFhaEvents(rawArrays, today) {
  const seen = new Set();
  const out = [];
  for (const arr of rawArrays) {
    for (const e of arr || []) {
      const key = e.slug || e.id || (e.title + e.startDate);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!e.startDate || e.startDate < today) continue; // upcoming only
      const item = {
        title: e.title,
        category: e.category || "Community",
        date: e.startDate,
        dateLabel: dlabel(e.startDate),
        time: tlabel(e.startTime, e.endTime),
        location: [e.locationName, e.locationAddress].filter(Boolean).join(", ") || "White Plains",
        summary: e.shortSummary || "",
        // Curated entries often carry only a flyer link, so prefer it over the
        // organizer's bare homepage.
        url: e.externalUrl || e.flyerPdf || e.sourceUrl || "",
        ctaLabel: e.ctaLabel || "Open city page",
        source: e.organizer || e.sourceLabel || "City of White Plains"
      };
      const es = summaryEs(e.title, e.shortSummary);
      if (es) item.summary_es = es;
      out.push(item);
    }
  }
  out.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  return out;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const arrays = [];
  const problems = [];
  for (const f of SOURCES) {
    try {
      const r = await fetch(BASE + f);
      if (!r.ok) { problems.push(`${f}: HTTP ${r.status}`); continue; }
      const list = asEventArray(await r.json());
      if (!list) { problems.push(`${f}: unrecognised shape (no array of events)`); continue; }
      arrays.push(list);
      console.log(`${f}: ${list.length} entries`);
    } catch (err) { problems.push(`${f}: ${err.message}`); }
  }
  // Never overwrite a good file with a broken fetch: bail loudly instead, so the
  // scheduled run goes red and the site keeps the last known-good events.
  if (!arrays.length) {
    throw new Error("No usable source data:\n  " + problems.join("\n  ") +
      "\nLeaving data/events.json unchanged.");
  }
  const events = toFhaEvents(arrays, today);
  if (!events.length) {
    throw new Error(`Fetched ${arrays.reduce((n, a) => n + a.length, 0)} raw entries but none are ` +
      `upcoming as of ${today}. Leaving data/events.json unchanged — check the upstream feed.`);
  }
  const out = { updated: today, note: "Auto-updated from the WPCNA / White Plains city calendar feed.", events };
  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${events.length} upcoming events to data/events.json`);
  // A partial success still means one feed is rotting. Exit 2 so CI publishes
  // what we did get and *then* raises the alarm, rather than silently limping.
  if (problems.length) {
    console.error("Some sources were unusable:\n  " + problems.join("\n  "));
    return 2;
  }
  return 0;
}

/* Exit codes: 0 = healthy, 2 = wrote but a source is unhealthy (still commit,
   then alert), 1 = nothing written (keep the last good file, alert). */
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(code => process.exit(code || 0))
        .catch(e => { console.error(e.message || e); process.exit(1); });
}
