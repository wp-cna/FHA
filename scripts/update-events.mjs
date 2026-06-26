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
        location: e.locationName || "White Plains",
        summary: e.shortSummary || "",
        url: e.externalUrl || e.sourceUrl || "",
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
  for (const f of SOURCES) {
    try {
      const r = await fetch(BASE + f);
      if (r.ok) arrays.push(await r.json());
      else console.error(`skip ${f}: HTTP ${r.status}`);
    } catch (err) { console.error(`skip ${f}: ${err.message}`); }
  }
  if (!arrays.length) { console.error("No source data fetched — leaving events.json unchanged."); return; }
  const events = toFhaEvents(arrays, today);
  const out = { updated: today, note: "Auto-updated from the WPCNA / White Plains city calendar feed.", events };
  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${events.length} upcoming events to data/events.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
