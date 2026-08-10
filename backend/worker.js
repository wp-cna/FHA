/* Fisher Hill Association — forms backend (Cloudflare Worker)
 *
 * Endpoints:
 *   POST /contact  → emails the configured board recipients
 *   POST /join     → emails the board a membership request for HUMAN review
 *                    (residency + dues; no AI auto-approval)
 *   POST /post     → runs the AI reviewer (see MODERATION.md), then — no matter
 *                    what the reviewer decides — NOTHING auto-publishes. The
 *                    submission is parked in the PENDING KV namespace under an
 *                    unguessable token (TTL 14 days) and ONE email goes to the
 *                    board with the submission, the AI's verdict, and action links:
 *                      Publish            → /action/publish?token=…
 *                      Reject (AI note)   → /action/reject?token=…
 *                      Reject (write own) → mailto: the submitter
 *   /action/publish and /action/reject: GET shows a confirmation page (safe
 *   against email link scanners that prefetch URLs); its button POSTs back to
 *   the same URL, which performs the action — publish commits the post (the
 *   AI-cleaned version when present) to data/posts.json via the GitHub API;
 *   reject emails the submitter a polite AI-drafted note. Each token is
 *   single-use: the POST deletes it from KV (restored if the action fails).
 *
 * Secrets (set with `wrangler secret put NAME`):
 *   RESEND_API_KEY, ANTHROPIC_API_KEY, GITHUB_TOKEN
 * Vars (wrangler.toml):
 *   ALLOWED_ORIGIN, BOARD_EMAIL, BOARD_EMAILS, MAIL_FROM, GITHUB_REPO
 * KV bindings: PENDING (required — pending submissions awaiting a board decision),
 *   RATE_LIMIT (required — hourly sender/IP counters and exact-post dedupe)
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
  "Neighborhood event": "Neighborhood Event",
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
// An event post is dated by when the event happens, not when it was submitted,
// and must outlive the usual TTL so it is still on the board on the day itself.
const MIN_EVENT_DAYS = 2;   // floor, so a mistyped past date still gets seen
function addDays(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// Shape AND calendar validity: "2026-02-31" parses to March 3 and "2026-13-01"
// yields an Invalid Date whose toISOString() throws, which would fail Publish.
function isIsoDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// How long a pending submission (and its action links) stays valid, in seconds.
const PENDING_TTL = 14 * 24 * 60 * 60;
const RATE_WINDOW = 60 * 60;
const DEDUPE_TTL = 24 * 60 * 60;
const SENDER_LIMIT = 5;
const IP_LIMIT = 20;
const REVIEW_DECISIONS = new Set(["APPROVE", "APPROVE_WITH_EDITS", "ESCALATE", "REJECT"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    // Board action links from the review email. GET shows a confirmation page
    // (so email link scanners that prefetch URLs can't trigger anything); the
    // page's button POSTs back to the same URL, which performs the action and
    // consumes the token.
    if (path === "/action/publish" || path === "/action/reject") {
      const act = path === "/action/publish" ? "publish" : "reject";
      if (request.method === "GET") return confirmAction(url, env, act);
      if (request.method === "POST") return handleAction(url, env, act);
      return json({ error: "Method not allowed" }, 405, cors);
    }

    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

    const body = await request.json().catch(() => ({}));

    // 1) Honeypot — bots fill this hidden field. Pretend success, do nothing.
    if (body.website) return json({ ok: true }, 200, cors);

    // 2) Rate limit by sender and IP without storing either value in KV keys.
    // Separate counters keep a changing email address from bypassing the IP cap.
    const limited = await enforceRateLimits(env, path, body, request, cors);
    if (limited) return limited;

    try {
      if (path === "/contact") return await handleContact(body, env, cors);
      if (path === "/post") return await handlePost(body, env, cors, url.origin);
      if (path === "/join") return await handleJoin(body, env, cors);
      return json({ error: "Not found" }, 404, cors);
    } catch (e) {
      console.error("FHA forms request failed", { path, error: String(e && e.message || e) });
      return json({ error: "Server error" }, 500, cors);
    }
  }
};

async function enforceRateLimits(env, path, body, request, cors) {
  if (!env.RATE_LIMIT) return null;
  try {
    const email = String(body.email || "").trim().toLowerCase();
    const ip = String(request.headers.get("CF-Connecting-IP") || "").trim();
    const checks = [];
    if (email) checks.push(["sender", `${path}|${email}`, SENDER_LIMIT]);
    if (ip) checks.push(["ip", `${path}|${ip}`, IP_LIMIT]);

    for (const [kind, value, limit] of checks) {
      const key = `rl:${kind}:${await sha256(value)}`;
      const count = Number.parseInt(await env.RATE_LIMIT.get(key) || "0", 10);
      if (Number.isFinite(count) && count >= limit) {
        return json({ error: "Too many submissions — please try again later." }, 429, cors);
      }
      await env.RATE_LIMIT.put(key, String((Number.isFinite(count) ? count : 0) + 1),
        { expirationTtl: RATE_WINDOW });
    }
  } catch (error) {
    // A temporary anti-abuse storage problem must not take every form offline.
    console.error("Rate-limit storage unavailable", { error: String(error && error.message || error) });
  }
  return null;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function handleContact(b, env, cors) {
  if (!b.name || !b.email || !b.message) return json({ error: "Missing required fields." }, 400, cors);
  await sendEmail(env, {
    to: boardRecipients(env),
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
    to: boardRecipients(env),
    replyTo: b.email,
    subject: `[FHA Membership] ${b.name} — ${res}`,
    text: `New membership request — verify the Fisher Hill connection, then send payment details (Venmo / FHA Chase, or mailing address for a check).\n\n` +
          `Name: ${b.name} <${b.email}>\nResidency: ${res}\nFisher Hill address: ${b.address}\nMembership: ${dues}\n` +
          (b.note ? `\nNote from applicant:\n${b.note}\n` : "")
  });
  return json({ ok: true }, 200, cors);
}

// Every submission — whatever the AI decides — waits for a human. The post is
// parked in PENDING under a random token and the board gets one email with the
// AI's verdict and Publish / Reject action links carrying that token.
async function handlePost(b, env, cors, origin) {
  const invalid = validatePost(b);
  if (invalid) return json({ error: invalid }, 400, cors);

  b.title = b.title.trim();
  b.message = b.message.trim();
  b.name = b.name.trim();
  b.email = b.email.trim().toLowerCase();

  // Exact repeats usually come from a double click or retry. Treat them as a
  // successful submission without paying for another review or emailing the
  // board twice. Similar-but-not-identical posts still go to human review.
  const duplicateKey = env.RATE_LIMIT
    ? "dedupe:" + await sha256(postFingerprint(b))
    : null;
  if (duplicateKey && await env.RATE_LIMIT.get(duplicateKey)) {
    return json({ ok: true, duplicate: true }, 200, cors);
  }

  const r = await review(b, env);

  const token = randomToken();
  await env.PENDING.put("post:" + token, JSON.stringify({ b, r, received: new Date().toISOString() }),
    { expirationTtl: PENDING_TTL });

  const hasEdits = !!(r.editedTitle || r.editedBody);
  const conf = typeof r.confidence === "number" ? r.confidence.toFixed(2) : "n/a";
  const mailto = "mailto:" + encodeURIComponent(b.email).replace(/%40/g, "@") +
    "?subject=" + encodeURIComponent("About your Fisher Hill board post: " + b.title);
  await sendEmail(env, {
    to: boardRecipients(env), replyTo: b.email,
    subject: `[FHA Board] ${r.decision || "REVIEW"}: ${b.title}`,
    text:
      "New board submission — nothing publishes until you act on it.\n\n" +
      "AI VETTING\n" +
      `AI reviewer: ${r.decision || "(no decision)"} · confidence ${conf}\n` +
      `Reason: ${r.reason || "(none given)"}\n` +
      (hasEdits
        ? `\nAI-cleaned version (this is what approval publishes):\nTitle: ${r.editedTitle || b.title}\nDetails: ${r.editedBody || b.message}\n`
        : "") +
      "\nAPPROVE & PUBLISH (one click)\n" +
      `${origin}/action/publish?token=${token}\n` +
      `Clicking this publishes${hasEdits ? " the AI-cleaned version" : " the submission"} after a confirmation page.\n\n` +
      "REJECT & NOTIFY SUBMITTER (one click)\n" +
      `${origin}/action/reject?token=${token}\n` +
      "Clicking this rejects the submission and emails a polite AI-drafted note after a confirmation page.\n\n" +
      "Both action links are single-use and expire in 14 days.\n\n" +
      "SUBMISSION DETAILS\n" +
      submissionText(b) + "\n\n" +
      "WRITE YOUR OWN RESPONSE INSTEAD\n" +
      `${mailto}\n`
  });

  if (duplicateKey) {
    await env.RATE_LIMIT.put(duplicateKey, "1", { expirationTtl: DEDUPE_TTL });
  }

  // The submitter always sees a neutral "submitted for review" message on the site.
  return json({ ok: true }, 200, cors);
}

function validatePost(b) {
  for (const field of ["title", "message", "name", "email", "postType"]) {
    if (typeof b[field] !== "string" || !b[field].trim()) return "Missing required fields.";
  }
  const title = b.title.trim();
  const message = b.message.trim();
  if (title.length < 3 || title.length > 120) return "Please use a title between 3 and 120 characters.";
  if (message.length < 12 || message.length > 900) return "Please add 12 to 900 characters of useful detail.";
  if (b.name.trim().length > 120) return "Please shorten the name field.";
  if (b.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()))
    return "Please enter a valid email address.";
  if (b.postType === "Neighborhood event" && !isIsoDate(b.eventDate))
    return "Please include the date when the event happens.";

  const wordsBeyondLinks = message.replace(/https?:\/\/\S+/gi, "").match(/[\p{L}\p{N}]/gu) || [];
  if (wordsBeyondLinks.length < 8) return "Please add a short description instead of submitting only a link.";
  return null;
}

function postFingerprint(b) {
  const normalize = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return [b.email, b.postType, b.title, b.message, b.eventDate, b.location].map(normalize).join("|");
}

// Shared validation for the two action endpoints. Returns { key, raw } on
// success or a Response to send straight back.
async function loadPending(url, env) {
  if (!env.PENDING) return page("Setup needed", "The PENDING KV namespace is not bound — see backend/wrangler.toml.", 500);
  const token = url.searchParams.get("token") || "";
  if (!/^[0-9a-f]{32}$/.test(token)) return page("Invalid link", "This action link is not valid.", 400);
  const key = "post:" + token;
  const raw = await env.PENDING.get(key);
  if (!raw) return page("Link expired", "This action link was already used, or it expired (links last 14 days).", 410);
  return { key, raw };
}

// GET /action/publish | /action/reject — show what's about to happen and a
// confirm button. Nothing changes on GET, so email-scanner prefetches are harmless.
async function confirmAction(url, env, act) {
  const got = await loadPending(url, env);
  if (got instanceof Response) return got;
  const pending = JSON.parse(got.raw);
  const title = pending.r.editedTitle || pending.b.title;
  const detail = act === "publish"
    ? "Publish “" + title + "” to the neighborhood board" + (pending.r.editedTitle || pending.r.editedBody ? " (the AI-cleaned version)" : "")
    : "Email " + pending.b.email + " a polite AI-drafted note that “" + pending.b.title + "” wasn't published";
  return page("Confirm: " + (act === "publish" ? "publish this post?" : "send the rejection note?"), detail + ".",
    200, { action: url.pathname + "?token=" + url.searchParams.get("token"),
           label: act === "publish" ? "Publish it" : "Send the note" });
}

// POST /action/publish | /action/reject — from the confirmation page's button.
// The token is single-use: it is deleted before the action runs (so a double
// click can't publish twice) and restored if the action fails.
async function handleAction(url, env, act) {
  const got = await loadPending(url, env);
  if (got instanceof Response) return got;
  const key = got.key, raw = got.raw;
  await env.PENDING.delete(key);
  const pending = JSON.parse(raw);
  try {
    if (act === "publish") {
      await appendPost(env, pending.b, pending.r);
      return page("Post published",
        "“" + (pending.r.editedTitle || pending.b.title) + "” is on its way to the board — the site picks it up in a minute or two.");
    }
    await sendEmail(env, {
      to: pending.b.email, replyTo: env.BOARD_EMAIL,
      subject: "About your Fisher Hill board post",
      text: await draftRejection(env, pending)
    });
    return page("Rejection sent", "A polite note was emailed to " + pending.b.email + ".");
  } catch (e) {
    await env.PENDING.put(key, raw, { expirationTtl: PENDING_TTL });
    return page("Something went wrong", "The action could not be completed. The link is still valid — try it again in a minute.", 500);
  }
}

// A short, kind rejection note based on the reviewer's reason. Falls back to a
// plain template if the drafting call fails.
async function draftRejection(env, pending) {
  const fallback = "Thanks for your submission to the Fisher Hill neighborhood board. " +
    "It wasn't posted, for this reason:\n\n  " + (pending.r.reason || "It didn't fit the board's guidelines.") +
    "\n\nIf you think this is a mistake, or you'd like to revise and resubmit, just reply to this email " +
    "and a board member will take a look.\n\n— The Fisher Hill Association board";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 400,
        system: "You draft short rejection emails for the Fisher Hill Association neighborhood board. " +
          "Given a submission and the reviewer's reason, write the plain-text body of a brief, warm, polite email " +
          "telling the submitter their post was not published and why, and inviting them to reply or resubmit a revised post. " +
          "No subject line. Sign off as: — The Fisher Hill Association board. Output only the email body.",
        messages: [{ role: "user", content: submissionText(pending.b) + "\n\nReviewer's reason: " + (pending.r.reason || "(none)") }]
      })
    }).then(r => r.json());
    const text = res.content && res.content[0] && res.content[0].text;
    return (text && text.trim()) || fallback;
  } catch (e) {
    return fallback;
  }
}

function randomToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  bytes.forEach(x => s += x.toString(16).padStart(2, "0"));
  return s;
}

// Tiny HTML page for the action links. Pass confirm:{action,label} to render
// a confirm button that POSTs to `action` (used by the GET confirmation step).
function page(title, msg, status, confirm) {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const form = confirm
    ? "<form method=\"post\" action=\"" + esc(confirm.action) + "\">" +
      "<button type=\"submit\">" + esc(confirm.label) + "</button></form>"
    : "";
  const html = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<title>" + esc(title) + " — Fisher Hill Association</title>" +
    "<style>body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#fceaf6;color:#211522;display:grid;place-items:center;min-height:100vh;margin:0}" +
    "main{background:#fff;border:1px solid #ebe0e9;border-top:6px solid #c01a8f;border-radius:12px;padding:34px 38px;max-width:26rem;margin:20px}" +
    "h1{font-size:22px;margin:0 0 10px}p{line-height:1.55;margin:0;color:#352c41}" +
    "form{margin:18px 0 0}button{background:#c01a8f;color:#fff;border:0;border-radius:10px;padding:12px 22px;font:inherit;font-weight:600;font-size:15px;cursor:pointer}" +
    "button:hover{background:#7a1059}</style></head>" +
    "<body><main><h1>" + esc(title) + "</h1><p>" + esc(msg) + "</p>" + form + "</main></body></html>";
  return new Response(html, { status: status || 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function review(b, env) {
  const user = submissionText(b);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system: REVIEW_SYSTEM, messages: [{ role: "user", content: user }] })
    });
    if (!response.ok) {
      console.error("AI review request failed", { status: response.status });
      return reviewFallback("The automated reviewer was unavailable; a board member should review this submission.");
    }
    const res = await response.json();
    const text = (res.content && res.content[0] && res.content[0].text) || "{}";
    const m = text.match(/\{[\s\S]*\}/);
    return normalizeReview(JSON.parse(m ? m[0] : text));
  } catch (error) {
    console.error("AI review could not be parsed", { error: String(error && error.message || error) });
    return reviewFallback("The automated reviewer could not complete its review; a board member should decide.");
  }
}

function reviewFallback(reason) {
  return {
    decision: "ESCALATE",
    reason,
    failedCriteria: [],
    editedTitle: null,
    editedBody: null,
    confidence: 0
  };
}

function normalizeReview(value) {
  if (!value || typeof value !== "object" || !REVIEW_DECISIONS.has(value.decision)) {
    return reviewFallback("The automated reviewer returned an invalid decision; a board member should decide.");
  }
  const decision = value.decision;
  const reason = typeof value.reason === "string" && value.reason.trim()
    ? value.reason.trim().slice(0, 500)
    : "No reason was supplied; a board member should review the submission.";
  const failedCriteria = Array.isArray(value.failedCriteria)
    ? value.failedCriteria.filter(item => typeof item === "string").map(item => item.slice(0, 80)).slice(0, 8)
    : [];
  const editedTitle = decision === "APPROVE_WITH_EDITS" && typeof value.editedTitle === "string"
    ? value.editedTitle.trim().slice(0, 120) || null
    : null;
  const editedBody = decision === "APPROVE_WITH_EDITS" && typeof value.editedBody === "string"
    ? value.editedBody.trim().slice(0, 900) || null
    : null;
  const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence)
    ? Math.max(0, Math.min(1, value.confidence))
    : 0;
  return { decision, reason, failedCriteria, editedTitle, editedBody, confidence };
}

async function appendPost(env, b, r) {
  const repo = env.GITHUB_REPO, path = "data/posts.json";
  const api = `https://api.github.com/repos/${repo}/contents/${path}`;
  const h = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, "User-Agent": "fha-forms", Accept: "application/vnd.github+json" };
  const curRes = await fetch(api, { headers: h });
  if (!curRes.ok) throw new Error("GitHub read failed: " + curRes.status);
  const cur = await curRes.json();
  const data = JSON.parse(b64decode((cur.content || "").replace(/\n/g, "")));
  const today = new Date().toISOString().slice(0, 10);
  const category = CATEGORY[b.postType] || "Neighborhood";
  const ttl = POST_TTL[category] != null ? POST_TTL[category] : DEFAULT_TTL;
  // A post is dated by the day it is ABOUT when the submitter gave an event
  // date; otherwise by the day it was submitted. An event stays up until the
  // day after it happens, never less than MIN_EVENT_DAYS from today.
  const eventDate = isIsoDate(b.eventDate) ? b.eventDate : null;
  const postDate = eventDate || today;
  const [y, mo, d] = postDate.split("-").map(Number);
  const floor = addDays(today, MIN_EVENT_DAYS);
  const eventExpiry = eventDate ? addDays(eventDate, 1) : null;
  data.posts.unshift({
    title: r.editedTitle || b.title,
    category: category,
    fh: true,
    date: postDate,
    dateLabel: `${MONTHS[mo - 1]} ${d}, ${y}`,
    // board hides the post after this date unless renewed
    expires: eventExpiry ? (eventExpiry > floor ? eventExpiry : floor) : addDays(today, ttl),
    time: String(b.eventTime || "").slice(0, 60),
    location: String(b.location || "").slice(0, 120),
    summary: (r.editedBody || b.message).slice(0, 400),
    source: b.name
  });
  data.updated = today;
  const content = b64encode(JSON.stringify(data, null, 2) + "\n");
  const putRes = await fetch(api, {
    method: "PUT", headers: h,
    body: JSON.stringify({ message: `Add board post: ${b.title}`, content, sha: cur.sha })
  });
  if (!putRes.ok) throw new Error("GitHub write failed: " + putRes.status);
}

async function sendEmail(env, { to, subject, text, replyTo }) {
  const recipients = Array.isArray(to) ? to : [to];
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: recipients, subject, text, reply_to: replyTo })
  });
  if (!res.ok) throw new Error("Email send failed: " + res.status);
  return res;
}

function boardRecipients(env) {
  const configured = [env.BOARD_EMAIL, env.BOARD_EMAILS].filter(Boolean).join(",");
  return [...new Set(String(configured).split(",").map(email => email.trim()).filter(Boolean))];
}

function submissionText(b) {
  // The event date is what the board is really approving — a wrong one dates the
  // card wrongly and can retire it early, so show it next to the details.
  const when = [
    isIsoDate(b.eventDate) ? `Event date: ${b.eventDate}` : null,
    b.eventTime ? `Event time: ${b.eventTime}` : null,
    b.location ? `Location: ${b.location}` : null
  ].filter(Boolean).join("\n");
  return `Type: ${b.postType}\nTitle: ${b.title}${when ? "\n" + when : ""}\n` +
    `Details: ${b.message}\n\nSubmitted by: ${b.name} <${b.email}>${b.phone ? " · " + b.phone : ""}`;
}
function json(o, status, cors) {
  return new Response(JSON.stringify(o), { status: status || 200, headers: { "Content-Type": "application/json", ...cors } });
}
function b64encode(str) { const bytes = new TextEncoder().encode(str); let bin = ""; bytes.forEach(c => bin += String.fromCharCode(c)); return btoa(bin); }
function b64decode(b64) { const bin = atob(b64); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); }

export { boardRecipients, enforceRateLimits, normalizeReview, postFingerprint, reviewFallback, sha256, validatePost };
