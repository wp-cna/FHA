/* Fisher Hill Association — forms backend (Cloudflare Worker)
 *
 * Three endpoints:
 *   POST /contact  → emails the board (fha.wp.info@gmail.com)
 *   POST /join     → emails the board a membership request for HUMAN review
 *                    (residency + dues; no AI auto-approval)
 *   POST /post     → runs the AI reviewer (see MODERATION.md), then:
 *                      APPROVE          → commits the post to data/posts.json
 *                      APPROVE_WITH_EDITS → commits the cleaned post
 *                      ESCALATE         → emails the board for a human decision
 *                      REJECT           → emails the submitter the reason
 *
 * Secrets (set with `wrangler secret put NAME`):
 *   RESEND_API_KEY, ANTHROPIC_API_KEY, GITHUB_TOKEN
 * Vars (wrangler.toml):
 *   ALLOWED_ORIGIN, BOARD_EMAIL, MAIL_FROM, GITHUB_REPO
 * Optional KV binding: RATE_LIMIT (for per-sender rate limiting)
 */

const MODEL = "claude-haiku-4-5-20251001"; // swap to a stronger model if desired

const REVIEW_SYSTEM = `You review submissions to the Fisher Hill Association neighborhood board before they are published. The board is a friendly neighborly classifieds board: its PURPOSE is to help local businesses get known, and to let neighbors post lost-and-found pets, tag sales, giveaways, and neighbor-to-neighbor needs and offers.

Your posture is PERMISSIVE: when in doubt, publish. The board should feel open. You are a light filter, not a gatekeeper. Promotion, prices, and yard sales are WELCOME — do not reject a post just because it advertises a local business or sale. A business announcing or introducing itself is welcome.

The three things you guard against:
1. SPAM — bulk, repeated, automated, bot, or link-farm submissions, or off-area solicitation. Reject these.
2. BUSINESS REVIEWS — this board is NOT Yelp or Google Reviews. A neighbor reviewing, rating, ranking, praising, or criticizing a business or service (positive OR negative), or comparing businesses, does not belong here. Reject reviews; a business simply announcing itself is fine.
3. Clear, serious violations — naming/attacking a specific person; harassing, threatening, or defamatory language; scams; or sharing a third party's private info. Reject the clear cases; ESCALATE the ambiguous ones.

Be lenient on tone (only clearly abusive language fails), relevance, and writing quality. Prefer fixing over rejecting: if a small edit makes a post publishable (remove a third party's phone number, trim a slur), choose APPROVE_WITH_EDITS and return cleaned text. You cannot verify facts — never reject on suspicion alone; ESCALATE instead.

Respond with ONLY a JSON object, no prose:
{"decision":"APPROVE|APPROVE_WITH_EDITS|ESCALATE|REJECT","reason":"one sentence","failedCriteria":["..."],"editedTitle":null,"editedBody":null,"confidence":0.0}`;

const CATEGORY = {
  "Local business or service": "Business",
  "Lost & found (pet or item)": "Lost & Found",
  "Tag sale / yard sale / giveaway": "Tag Sale",
  "Neighbor need or offer": "Neighbor",
  "Other": "Neighborhood"
};
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// How long a post stays on the board before it must be renewed (days).
// Time-sensitive neighbor posts expire weekly so the board stays fresh; business
// listings and recommendations live much longer. Anything not listed uses DEFAULT_TTL.
const POST_TTL = {
  "Lost & Found": 7,   // lost pets etc. — renew weekly
  "Tag Sale": 7,
  "Neighbor": 7,
  "Business": 90       // local businesses stay "known" for a quarter
};
const DEFAULT_TTL = 14;
function addDays(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

    const body = await request.json().catch(() => ({}));

    // 1) Honeypot — bots fill this hidden field. Pretend success, do nothing.
    if (body.website) return json({ ok: true }, 200, cors);

    // 2) Rate limit (optional, needs a RATE_LIMIT KV binding)
    const who = (body.email || "") + "|" + (request.headers.get("CF-Connecting-IP") || "");
    if (env.RATE_LIMIT) {
      const k = "rl:" + who;
      const n = parseInt(await env.RATE_LIMIT.get(k) || "0", 10);
      if (n >= 5) return json({ error: "Too many submissions — please try again later." }, 429, cors);
      await env.RATE_LIMIT.put(k, String(n + 1), { expirationTtl: 3600 });
    }

    const path = new URL(request.url).pathname;
    try {
      if (path.endsWith("/contact")) return await handleContact(body, env, cors);
      if (path.endsWith("/post")) return await handlePost(body, env, cors);
      if (path.endsWith("/join")) return await handleJoin(body, env, cors);
      return json({ error: "Not found" }, 404, cors);
    } catch (e) {
      return json({ error: "Server error" }, 500, cors);
    }
  }
};

async function handleContact(b, env, cors) {
  if (!b.name || !b.email || !b.message) return json({ error: "Missing required fields." }, 400, cors);
  await sendEmail(env, {
    to: env.BOARD_EMAIL,
    replyTo: b.email,
    subject: `[FHA Contact] ${b.subject || "(no subject)"} — ${b.name}`,
    text: `From: ${b.name} <${b.email}>\nSubject: ${b.subject || "(none)"}\n\n${b.message}`
  });
  return json({ ok: true }, 200, cors);
}

// Membership requests get a HUMAN review (residency + dues) — no AI auto-approval.
// The board verifies the Fisher Hill connection, then follows up with payment details.
async function handleJoin(b, env, cors) {
  if (!b.name || !b.email || !b.residency || !b.address || !b.membership)
    return json({ error: "Missing required fields." }, 400, cors);
  const dues = b.membership === "family" ? "Family — $10/year" : "Individual — $5/year";
  const res = b.residency === "former" ? "Former Fisher Hill resident" : "Current Fisher Hill resident";
  await sendEmail(env, {
    to: env.BOARD_EMAIL,
    replyTo: b.email,
    subject: `[FHA Membership] ${b.name} — ${res}`,
    text: `New membership request — verify the Fisher Hill connection, then send payment details (Venmo / FHA Chase, or mailing address for a check).\n\n` +
          `Name: ${b.name} <${b.email}>\nResidency: ${res}\nFisher Hill address: ${b.address}\nMembership: ${dues}\n` +
          (b.note ? `\nNote from applicant:\n${b.note}\n` : "")
  });
  return json({ ok: true }, 200, cors);
}

async function handlePost(b, env, cors) {
  if (!b.title || !b.message || !b.name || !b.email || !b.postType)
    return json({ error: "Missing required fields." }, 400, cors);

  const r = await review(b, env);

  if (r.decision === "APPROVE" || r.decision === "APPROVE_WITH_EDITS") {
    await appendPost(env, b, r);
  } else if (r.decision === "ESCALATE") {
    await sendEmail(env, {
      to: env.BOARD_EMAIL, replyTo: b.email,
      subject: `[FHA Board] Review needed: ${b.title}`,
      text: `The reviewer flagged this for a human decision.\nReason: ${r.reason}\n\n` + submissionText(b)
    });
  } else { // REJECT
    await sendEmail(env, {
      to: b.email, replyTo: env.BOARD_EMAIL,
      subject: "About your Fisher Hill board post",
      text: `Thanks for your submission. It wasn't posted to the board for this reason:\n\n  ${r.reason}\n\nIf you think this is a mistake, reply to this email and a board member will take a look.`
    });
  }
  // The submitter always sees a neutral "submitted for review" message on the site.
  return json({ ok: true }, 200, cors);
}

async function review(b, env) {
  const user = submissionText(b);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, system: REVIEW_SYSTEM, messages: [{ role: "user", content: user }] })
  }).then(r => r.json());
  const text = (res.content && res.content[0] && res.content[0].text) || "{}";
  const m = text.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : text); }
  catch { return { decision: "ESCALATE", reason: "Reviewer output could not be parsed." }; }
}

async function appendPost(env, b, r) {
  const repo = env.GITHUB_REPO, path = "data/posts.json";
  const api = `https://api.github.com/repos/${repo}/contents/${path}`;
  const h = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, "User-Agent": "fha-forms", Accept: "application/vnd.github+json" };
  const cur = await fetch(api, { headers: h }).then(x => x.json());
  const data = JSON.parse(b64decode((cur.content || "").replace(/\n/g, "")));
  const today = new Date().toISOString().slice(0, 10);
  const [y, mo, d] = today.split("-").map(Number);
  const category = CATEGORY[b.postType] || "Neighborhood";
  const ttl = POST_TTL[category] != null ? POST_TTL[category] : DEFAULT_TTL;
  data.posts.unshift({
    title: r.editedTitle || b.title,
    category: category,
    fh: true,
    date: today,
    dateLabel: `${MONTHS[mo - 1]} ${d}, ${y}`,
    expires: addDays(today, ttl),   // board hides the post after this date unless renewed
    time: "",
    location: "",
    summary: (r.editedBody || b.message).slice(0, 400),
    source: b.name
  });
  data.updated = today;
  const content = b64encode(JSON.stringify(data, null, 2) + "\n");
  await fetch(api, {
    method: "PUT", headers: h,
    body: JSON.stringify({ message: `Add board post: ${b.title}`, content, sha: cur.sha })
  });
}

async function sendEmail(env, { to, subject, text, replyTo }) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, reply_to: replyTo })
  });
}

function submissionText(b) {
  return `Type: ${b.postType}\nTitle: ${b.title}\nDetails: ${b.message}\n\nSubmitted by: ${b.name} <${b.email}>${b.phone ? " · " + b.phone : ""}`;
}
function json(o, status, cors) {
  return new Response(JSON.stringify(o), { status: status || 200, headers: { "Content-Type": "application/json", ...cors } });
}
function b64encode(str) { const bytes = new TextEncoder().encode(str); let bin = ""; bytes.forEach(c => bin += String.fromCharCode(c)); return btoa(bin); }
function b64decode(b64) { const bin = atob(b64); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); }
