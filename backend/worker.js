/* Fisher Hill Association — forms backend (Cloudflare Worker)
 *
 * Endpoints:
 *   POST /contact  → emails the configured board recipients
 *   POST /join     → emails the board a membership request for HUMAN review
 *                    (residency + dues; no AI auto-approval)
 *   POST /post     → runs the AI reviewer (see MODERATION.md), then — no matter
 *                    what the reviewer decides — NOTHING auto-publishes. The
 *                    submission is stored in a per-token SQLite-backed Durable
 *                    Object (TTL 14 days) and ONE email goes to the
 *                    board with the submission, the AI's verdict, and action links:
 *                      Publish            → /action/publish?token=…
 *                      Reject (AI note)   → /action/reject?token=…
 *                      Reject (write own) → mailto: the submitter
 *   /action/publish and /action/reject: GET shows a confirmation page (safe
 *   against email link scanners that prefetch URLs); its button POSTs back to
 *   the same URL, which performs the action — publish commits the post (the
 *   AI-cleaned version when present) to data/posts.json via the GitHub API;
 *   reject emails the submitter a polite AI-drafted note. A SQLite-backed
 *   Durable Object atomically claims the first confirmed action for each token
 *   before any external I/O; PENDING KV is only a legacy-token fallback.
 *
 * Secrets (set with `wrangler secret put NAME`):
 *   RESEND_API_KEY, ANTHROPIC_API_KEY, GITHUB_TOKEN
 * Vars (wrangler.toml):
 *   ALLOWED_ORIGIN, BOARD_EMAIL, BOARD_EMAILS, MAIL_FROM, GITHUB_REPO,
 *   SITE_POSTS_URL
 * Bindings: IP_RATE_LIMITER, EMAIL_RATE_LIMITER, MODERATION_ACTIONS
 * KV bindings: PENDING (pending payloads), RATE_LIMIT (exact-post dedupe only)
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
const DEDUPE_TTL = 24 * 60 * 60;
const MAX_BODY_BYTES = 16 * 1024;
const PUBLIC_CONTACT_MAX = 254;
const FORM_PATHS = new Set(["/contact", "/join", "/post"]);
const EMAIL_RE = /^[^\s@/?#]+@[^\s@/?#]+\.[^\s@/?#]+$/;
const REVIEW_DECISIONS = new Set(["APPROVE", "APPROVE_WITH_EDITS", "ESCALATE", "REJECT"]);

const CONTACT_FIELDS = {
  fh_check: { max: 200 },
  // Accept the old honeypot name while cached pages and existing bots age out.
  website: { max: 200 },
  name: { required: true, max: 120, singleLine: true },
  email: { required: true, max: 254, singleLine: true, email: true, lower: true },
  subject: { max: 160, singleLine: true },
  message: { required: true, max: 4000 }
};
const JOIN_FIELDS = {
  fh_check: { max: 200 },
  website: { max: 200 },
  name: { required: true, max: 120, singleLine: true },
  email: { required: true, max: 254, singleLine: true, email: true, lower: true },
  residency: { required: true, max: 10, values: ["current", "former"] },
  address: { required: true, max: 240, singleLine: true },
  membership: { required: true, max: 10, values: ["individual", "family"] },
  note: { max: 2000 }
};
const POST_FIELDS = {
  fh_check: { max: 200 },
  website: { max: 200 },
  postType: { required: true, max: 40, values: Object.keys(CATEGORY) },
  title: { required: true, max: 120, singleLine: true },
  message: { required: true, max: 900 },
  eventDate: { max: 10, singleLine: true },
  eventTime: { max: 60, singleLine: true },
  location: { max: 120, singleLine: true },
  name: { required: true, max: 120, singleLine: true },
  email: { required: true, max: 254, singleLine: true, email: true, lower: true },
  publicContact: { max: PUBLIC_CONTACT_MAX, singleLine: true },
  phone: { max: PUBLIC_CONTACT_MAX, singleLine: true },
  agree: { max: 16, singleLine: true }
};

// Classic Durable Object entry point is used so the existing dependency-free
// Node test suite can import this module. SQLite is authoritative for both the
// payload and the first confirmed choice; no external I/O occurs in this class.
export class ModerationAction {
  constructor(state) {
    this.state = state;
    state.blockConcurrencyWhile(async () => {
      state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS moderation_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          payload TEXT,
          expires_at INTEGER NOT NULL,
          kind TEXT CHECK (kind IN ('publish', 'reject')),
          claimed_at INTEGER,
          completed_at INTEGER
        )
      `);
    });
  }

  async initialize(payload, expiresAt) {
    const result = initializeModerationAction(this.state.storage.sql, payload, expiresAt);
    if (!result.expired) await this.state.storage.setAlarm(expiresAt);
    return result;
  }

  read() {
    return readModerationAction(this.state.storage.sql);
  }

  claim(kind) {
    return claimModerationAction(this.state.storage.sql, kind);
  }

  complete(kind) {
    return completeModerationAction(this.state.storage.sql, kind);
  }

  async alarm() {
    this.state.storage.sql.exec("DELETE FROM moderation_state");
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST")
      return Response.json({ error: "Not found" }, { status: 404 });
    try {
      const input = await request.json();
      if (url.pathname === "/initialize") return Response.json(await this.initialize(input.payload, input.expiresAt));
      if (url.pathname === "/read") return Response.json(this.read());
      if (url.pathname === "/claim") return Response.json(this.claim(input.kind));
      if (url.pathname === "/complete") return Response.json(this.complete(input.kind));
      return Response.json({ error: "Not found" }, { status: 404 });
    } catch (error) {
      return Response.json({ error: "Invalid moderation request" }, { status: 400 });
    }
  }
}

function initializeModerationAction(sql, payload, expiresAt, now = Date.now()) {
  if (typeof payload !== "string" || !payload || payload.length > 32 * 1024)
    throw new Error("Invalid moderation payload");
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new Error("Invalid action expiry");
  const existing = readModerationRow(sql);
  if (existing) return { initialized: false, expired: now >= existing.expiresAt, state: publicActionState(existing) };
  if (now >= expiresAt) return { initialized: false, expired: true, state: null };
  sql.exec(
    "INSERT INTO moderation_state (singleton, payload, expires_at) VALUES (1, ?, ?)",
    payload, expiresAt
  );
  return { initialized: true, expired: false, state: { kind: null, claimedAt: null, expiresAt } };
}

function readModerationAction(sql, now = Date.now()) {
  const row = readModerationRow(sql);
  if (!row) return { initialized: false, expired: false, state: null, payload: null };
  return {
    initialized: true,
    expired: now >= row.expiresAt,
    state: publicActionState(row),
    payload: row.payload
  };
}

function claimModerationAction(sql, kind, now = Date.now()) {
  if (kind !== "publish" && kind !== "reject") throw new Error("Invalid moderation action");
  const row = readModerationRow(sql);
  if (!row) return { initialized: false, claimed: false, expired: false, state: null, payload: null };
  if (now >= row.expiresAt)
    return { initialized: true, claimed: false, expired: true, state: publicActionState(row), payload: null };
  if (row.kind)
    return { initialized: true, claimed: false, expired: false, state: publicActionState(row), payload: null };

  sql.exec("UPDATE moderation_state SET kind = ?, claimed_at = ? WHERE singleton = 1 AND kind IS NULL", kind, now);
  const claimed = readModerationRow(sql);
  return {
    initialized: true,
    claimed: claimed.kind === kind && claimed.claimedAt === now,
    expired: false,
    state: publicActionState(claimed),
    payload: claimed.kind === kind && claimed.claimedAt === now ? claimed.payload : null
  };
}

function completeModerationAction(sql, kind, now = Date.now()) {
  if (kind !== "publish" && kind !== "reject") throw new Error("Invalid moderation action");
  sql.exec(
    "UPDATE moderation_state SET payload = NULL, completed_at = ? WHERE singleton = 1 AND kind = ?",
    now, kind
  );
  const row = readModerationRow(sql);
  return { completed: !!(row && row.kind === kind && row.payload == null), state: row ? publicActionState(row) : null };
}

function readModerationRow(sql) {
  const rows = sql.exec(
    "SELECT payload, expires_at AS expiresAt, kind, claimed_at AS claimedAt, completed_at AS completedAt " +
      "FROM moderation_state WHERE singleton = 1"
  ).toArray();
  return rows[0] || null;
}

function publicActionState(row) {
  return { kind: row.kind || null, claimedAt: row.claimedAt || null, expiresAt: row.expiresAt,
    completedAt: row.completedAt || null };
}

export default {
  async fetch(request, env, ctx) {
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
      if (request.method === "POST") return handleAction(url, env, act, ctx);
      return json({ error: "Method not allowed" }, 405, cors);
    }

    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

    if (!FORM_PATHS.has(path)) return json({ error: "Not found" }, 404, cors);

    const mediaType = requestMediaType(request);
    const native = wantsHtml(request, mediaType);
    const respond = (payload, status) => submissionResponse(native, path, payload, status, cors);

    // IP limiting runs before reading even one byte of an attacker-controlled body.
    const ipLimited = await enforceIpRateLimit(env, request, respond);
    if (ipLimited) return ipLimited;

    const parsed = await readSubmissionBody(request, mediaType);
    if (parsed.error) return respond({ error: parsed.error }, parsed.status);

    const checked = validateSubmission(path, parsed.value);
    if (checked.error) return respond({ error: checked.error }, 400);
    const body = checked.value;

    // The email has been type-, length-, and syntax-validated at this point.
    const emailLimited = await enforceEmailRateLimit(env, body.email, respond);
    if (emailLimited) return emailLimited;

    try {
      if (path === "/contact") return await handleContact(body, env, respond);
      if (path === "/post") return await handlePost(body, env, respond, url.origin);
      return await handleJoin(body, env, respond);
    } catch (e) {
      logError("forms_request_failed", { path, error: errorMessage(e) });
      return respond({ error: "The service could not complete your submission. Please try again later." }, 500);
    }
  }
};

async function enforceIpRateLimit(env, request, respond) {
  const ip = String(request.headers.get("CF-Connecting-IP") || "unknown").trim().slice(0, 128);
  return enforceRateLimit(env.IP_RATE_LIMITER, "ip", await sha256("ip:" + ip), respond);
}

// A filled honeypot (fh_check, or the legacy "website" name bots still POST) is
// only a hint — browser autofill and password managers fill hidden fields too.
// Nothing is ever silently dropped: the board email is tagged instead, and a
// human decides. AI review + moderation already gate what publishes.
function suspectTag(body) {
  return body && (body.fh_check || body.website) ? "[SUSPECT] " : "";
}

async function enforceEmailRateLimit(env, email, respond) {
  return enforceRateLimit(env.EMAIL_RATE_LIMITER, "email", await sha256("email:" + email), respond);
}

async function enforceRateLimit(binding, kind, key, respond) {
  if (!binding || typeof binding.limit !== "function") {
    logError("rate_limit_binding_missing", { kind });
    return respond({ error: "The submission service is temporarily unavailable." }, 503);
  }
  try {
    const result = await binding.limit({ key });
    if (!result || typeof result.success !== "boolean") throw new Error("Invalid rate-limit response");
    if (result.success) return null;
    console.warn({ event: "form_rate_limited", kind });
    return respond({ error: "Too many submissions — please try again later." }, 429);
  } catch (error) {
    logError("rate_limit_binding_unavailable", { kind, error: errorMessage(error) });
    return respond({ error: "The submission service is temporarily unavailable." }, 503);
  }
}

function requestMediaType(request) {
  return String(request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
}

function wantsHtml(request, mediaType) {
  return mediaType !== "application/json" && /(?:^|,)\s*text\/html(?:\s*;|\s*,|$)/i.test(request.headers.get("Accept") || "");
}

async function readSubmissionBody(request, mediaType) {
  const supported = new Set(["application/json", "application/x-www-form-urlencoded", "multipart/form-data"]);
  if (!supported.has(mediaType)) {
    return { error: "Content-Type must be application/json or a standard HTML form encoding.", status: 415 };
  }

  const declared = request.headers.get("Content-Length");
  if (declared != null && declared !== "") {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0) return { error: "Invalid Content-Length.", status: 400 };
    if (length > MAX_BODY_BYTES) return { error: "Submission is too large.", status: 413 };
  }
  if (!request.body) return { error: "Request body is required.", status: 400 };

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel("Body size limit exceeded").catch(() => {});
        return { error: "Submission is too large.", status: 413 };
      }
      chunks.push(part.value);
    }
  } catch (error) {
    logError("request_body_read_failed", { error: errorMessage(error) });
    return { error: "Request body could not be read.", status: 400 };
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }

  if (mediaType === "multipart/form-data") {
    try {
      const copy = new Request("https://form-parser.invalid/", {
        method: "POST",
        headers: { "Content-Type": request.headers.get("Content-Type") },
        body: bytes
      });
      return formEntriesToObject(await copy.formData());
    } catch (error) {
      return { error: "Malformed multipart form body.", status: 400 };
    }
  }

  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch (error) { return { error: "Request body must be valid UTF-8.", status: 400 }; }

  if (mediaType === "application/x-www-form-urlencoded") {
    return formEntriesToObject(new URLSearchParams(text));
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return { error: "JSON body must be an object.", status: 400 };
    return { value };
  } catch (error) {
    return { error: "Malformed JSON body.", status: 400 };
  }
}

function formEntriesToObject(entries) {
  const value = Object.create(null);
  for (const [key, item] of entries.entries()) {
    if (Object.prototype.hasOwnProperty.call(value, key))
      return { error: "Duplicate form fields are not allowed.", status: 400 };
    if (typeof item !== "string") return { error: "File uploads are not supported.", status: 400 };
    value[key] = item;
  }
  return { value };
}

function validateSubmission(path, body) {
  if (path === "/contact") return validateFields(body, CONTACT_FIELDS);
  if (path === "/join") return validateFields(body, JOIN_FIELDS);
  return validatePostBody(body);
}

function validateFields(body, schema) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Form body must be an object." };
  for (const key of Object.keys(body)) {
    if (!Object.prototype.hasOwnProperty.call(schema, key)) return { error: "Unexpected form field." };
  }

  const value = {};
  for (const [field, rule] of Object.entries(schema)) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) {
      if (rule.required) return { error: "Missing required fields." };
      value[field] = "";
      continue;
    }
    const raw = body[field];
    if (typeof raw !== "string") return { error: `${field} must be text.` };
    if (raw.length > rule.max) return { error: `${field} is too long.` };
    const normalized = raw.trim();
    if (rule.required && !normalized) return { error: "Missing required fields." };
    if (rule.singleLine && /[\r\n]/.test(normalized)) return { error: `${field} must be a single line.` };
    if (rule.values && !rule.values.includes(normalized)) return { error: `${field} has an invalid value.` };
    if (rule.email && !EMAIL_RE.test(normalized)) return { error: "Please enter a valid email address." };
    value[field] = rule.lower ? normalized.toLowerCase() : normalized;
  }
  return { value };
}

function submissionResponse(native, path, payload, status, cors) {
  if (!native) return json(payload, status, cors);
  const ok = status >= 200 && status < 300;
  const success = {
    "/contact": "Your message was sent to the Fisher Hill Association board.",
    "/join": "Your membership request was received. A board member will follow up with payment details.",
    "/post": "Your neighborhood post was submitted for review."
  };
  return page(ok ? "Submission received" : "Unable to submit",
    ok ? success[path] : (payload.error || "The submission could not be completed."), status);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function handleContact(b, env, respond) {
  await sendEmail(env, {
    to: boardRecipients(env),
    replyTo: b.email,
    subject: `${suspectTag(b)}[FHA Contact] ${b.subject || "(no subject)"} — ${b.name}`,
    text: `From: ${b.name} <${b.email}>\nSubject: ${b.subject || "(none)"}\n\n${b.message}`
  });
  return respond({ ok: true }, 200);
}

// Membership requests get a HUMAN review (residency + dues) — no AI auto-approval.
// The board verifies the Fisher Hill connection, then follows up with payment details.
async function handleJoin(b, env, respond) {
  const dues = b.membership === "family" ? "Family — $10/year" : "Individual — $5/year";
  const res = b.residency === "former" ? "Former Fisher Hill resident" : "Current Fisher Hill resident";
  await sendEmail(env, {
    to: boardRecipients(env),
    replyTo: b.email,
    subject: `${suspectTag(b)}[FHA Membership] ${b.name} — ${res}`,
    text: `New membership request — verify the Fisher Hill connection, then send the current payment instructions.\n\n` +
          `Name: ${b.name} <${b.email}>\nResidency: ${res}\nFisher Hill address: ${b.address}\nMembership: ${dues}\n` +
          (b.note ? `\nNote from applicant:\n${b.note}\n` : "")
  });
  return respond({ ok: true }, 200);
}

// Every submission — whatever the AI decides — waits for a human. The post is
// stored authoritatively in a per-token Durable Object and the board gets one
// email with the AI verdict and Publish / Reject confirmation links.
async function handlePost(b, env, respond, origin) {
  // The new form calls this field publicContact so publication is explicit.
  // Keep accepting the old phone field while cached/older forms age out.
  b.publicContact = publicContactValue(b);

  // Exact repeats usually come from a double click or retry. Treat them as a
  // successful submission without paying for another review or emailing the
  // board twice. Similar-but-not-identical posts still go to human review.
  let duplicateKey = null;
  if (env.RATE_LIMIT) {
    try {
      duplicateKey = "dedupe:" + await sha256(postFingerprint(b));
      if (await env.RATE_LIMIT.get(duplicateKey)) {
        return respond({ ok: true, duplicate: true }, 200);
      }
    } catch (error) {
      duplicateKey = null;
      logError("dedupe_read_failed", { error: errorMessage(error) });
    }
  }

  if (!env.MODERATION_ACTIONS || typeof env.MODERATION_ACTIONS.getByName !== "function")
    throw new Error("MODERATION_ACTIONS binding is unavailable");
  const r = await review(b, env);

  const token = randomToken();
  const received = new Date().toISOString();
  const raw = JSON.stringify({ b, r, received });
  const expiresAt = Date.parse(received) + PENDING_TTL * 1000;
  await initializeActionToken(env, token, raw, expiresAt);
  // Legacy fallback only. New reads and claims are authoritative in the DO, so
  // KV propagation delay cannot make a fresh action link appear expired.
  if (env.PENDING && typeof env.PENDING.put === "function") {
    try { await env.PENDING.put("post:" + token, raw, { expirationTtl: PENDING_TTL }); }
    catch (error) { logError("legacy_pending_write_failed", { error: errorMessage(error) }); }
  }

  const hasEdits = !!(r.editedTitle || r.editedBody);
  const conf = typeof r.confidence === "number" ? r.confidence.toFixed(2) : "n/a";
  const mailto = "mailto:" + encodeURIComponent(b.email).replace(/%40/g, "@") +
    "?subject=" + encodeURIComponent("About your Fisher Hill board post: " + b.title);
  await sendEmail(env, {
    to: boardRecipients(env), replyTo: b.email,
    subject: `${suspectTag(b)}[FHA Board] ${r.decision || "REVIEW"}: ${b.title}`,
    text:
      "New board submission — nothing publishes until you act on it.\n\n" +
      "AI VETTING\n" +
      `AI reviewer: ${r.decision || "(no decision)"} · confidence ${conf}\n` +
      `Reason: ${r.reason || "(none given)"}\n` +
      (hasEdits
        ? `\nAI-cleaned version (this is what approval publishes):\nTitle: ${r.editedTitle || b.title}\nDetails: ${r.editedBody || b.message}\n`
        : "") +
      "\nAPPROVE & PUBLISH (confirmation required)\n" +
      `${origin}/action/publish?token=${token}\n` +
      `Open the link, review the confirmation page, then confirm to publish${hasEdits ? " the AI-cleaned version" : " the submission"}.\n\n` +
      "REJECT & NOTIFY SUBMITTER (confirmation required)\n" +
      `${origin}/action/reject?token=${token}\n` +
      "Open the link, review the confirmation page, then confirm to reject and email a polite AI-drafted note.\n\n" +
      "The first confirmed choice is atomically claimed; later attempts cannot run a conflicting action. Links expire in 14 days.\n\n" +
      "SUBMISSION DETAILS\n" +
      submissionText(b) + "\n\n" +
      "WRITE YOUR OWN RESPONSE INSTEAD\n" +
      `${mailto}\n`
  });

  if (duplicateKey) {
    try { await env.RATE_LIMIT.put(duplicateKey, "1", { expirationTtl: DEDUPE_TTL }); }
    catch (error) { logError("dedupe_write_failed", { error: errorMessage(error) }); }
  }

  // The submitter always sees a neutral "submitted for review" message on the site.
  return respond({ ok: true }, 200);
}

function validatePost(b) {
  const checked = validatePostBody(b);
  return checked.error || null;
}

function validatePostBody(b) {
  const checked = validateFields(b, POST_FIELDS);
  if (checked.error) return checked;
  const value = checked.value;
  const title = value.title;
  const message = value.message;
  if (title.length < 3 || title.length > 120) return { error: "Please use a title between 3 and 120 characters." };
  if (message.length < 12 || message.length > 900) return { error: "Please add 12 to 900 characters of useful detail." };
  const contactError = validatePublicContact(publicContactValue(value));
  if (contactError) return { error: contactError };
  if (value.eventDate && !isIsoDate(value.eventDate)) return { error: "Please enter a valid event date." };
  if (value.postType === "Neighborhood event" && !isIsoDate(value.eventDate))
    return { error: "Please include the date when the event happens." };

  const wordsBeyondLinks = message.replace(/https?:\/\/\S+/gi, "").match(/[\p{L}\p{N}]/gu) || [];
  if (wordsBeyondLinks.length < 8) return { error: "Please add a short description instead of submitting only a link." };
  return { value };
}

function postFingerprint(b) {
  const normalize = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return [b.email, b.postType, b.title, b.message, b.eventDate, b.location, publicContactValue(b)]
    .map(normalize).join("|");
}

// Returns the explicitly public contact value. `phone` is the pre-2026 field
// name and remains supported so submissions from older cached pages are not lost.
function publicContactValue(b) {
  if (!b || typeof b !== "object") return "";
  if (typeof b.publicContact === "string" && b.publicContact.trim()) return b.publicContact.trim();
  return typeof b.phone === "string" ? b.phone.trim() : "";
}

function publicContactKind(value) {
  const contact = String(value || "").trim();
  if (!contact) return "";
  if (/^[^\s@/?#]+@[^\s@/?#]+\.[^\s@/?#]+$/.test(contact)) return "email";

  const phone = contact.match(/^(\+?[\d\s().-]+?)(?:\s*(?:x|ext\.?)\s*(\d{1,8}))?$/i);
  if (phone) {
    const digits = phone[1].replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) return "phone";
  }

  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(contact);
    const url = new URL(hasScheme ? contact : "https://" + contact);
    if (url.protocol === "https:" && url.hostname && !url.username && !url.password &&
        (url.hostname.includes(".") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname))) {
      return "url";
    }
  } catch (error) {
    // The caller turns an unrecognized value into a field-level validation error.
  }
  return null;
}

function validatePublicContact(value) {
  const contact = String(value || "").trim();
  if (!contact) return null;
  if (contact.length > PUBLIC_CONTACT_MAX)
    return `Please keep the public contact field to ${PUBLIC_CONTACT_MAX} characters or fewer.`;
  if (!publicContactKind(contact))
    return "Please enter a valid public phone number, email address, or secure https:// website URL.";
  return null;
}

// GET /action/publish | /action/reject — show what's about to happen and a
// confirm button. Nothing changes on GET, so email-scanner prefetches are harmless.
async function confirmAction(url, env, act) {
  const token = url.searchParams.get("token") || "";
  if (!/^[0-9a-f]{32}$/.test(token)) return page("Invalid link", "This action link is not valid.", 400);
  let stored;
  try { stored = await readActionToken(env, token); }
  catch (error) {
    logError("moderation_read_failed", { error: errorMessage(error) });
    return page("Action unavailable", "The moderation store is temporarily unavailable. Nothing was changed.", 503);
  }
  if (!stored.initialized || stored.expired || !stored.payload)
    return page("Link expired", "This moderation link expired, or its completed payload has already been removed.", 410);
  if (stored.state && stored.state.kind) {
    return page("Action already claimed",
      "A board member already confirmed " + (stored.state.kind === "publish" ? "Publish" : "Reject") +
      ". No second or conflicting action can run.", 409);
  }
  let pending;
  try { pending = JSON.parse(stored.payload); }
  catch (error) {
    logError("moderation_payload_invalid", { error: errorMessage(error) });
    return page("Action unavailable", "The stored submission could not be read. A board member must review it manually.", 500);
  }
  const title = pending.r.editedTitle || pending.b.title;
  const detail = act === "publish"
    ? "Publish “" + title + "” to the neighborhood board" + (pending.r.editedTitle || pending.r.editedBody ? " (the AI-cleaned version)" : "")
    : "Email " + pending.b.email + " a polite AI-drafted note that “" + pending.b.title + "” wasn't published";
  return page("Confirm: " + (act === "publish" ? "publish this post?" : "send the rejection note?"), detail + ".",
    200, { action: url.pathname + "?token=" + url.searchParams.get("token"),
           label: act === "publish" ? "Publish it" : "Send the note" });
}

// POST /action/publish | /action/reject — the per-token Durable Object persists
// and returns the first confirmed choice plus payload before any external I/O.
async function handleAction(url, env, act, ctx) {
  const token = url.searchParams.get("token") || "";
  if (!/^[0-9a-f]{32}$/.test(token)) return page("Invalid link", "This action link is not valid.", 400);
  let claim;
  try {
    claim = await claimActionToken(env, token, act);
  } catch (error) {
    logError("moderation_claim_failed", { action: act, error: errorMessage(error) });
    return page("Action unavailable", "The action lock is temporarily unavailable. Nothing was published or emailed.", 503);
  }
  if (!claim.initialized) return page("Link expired", "This moderation link has expired. Nothing was published or emailed.", 410);
  if (claim.expired) return page("Link expired", "This moderation link has expired. Nothing was published or emailed.", 410);
  if (!claim.claimed) {
    return page("Action already claimed",
      "A board member already confirmed " + (claim.state && claim.state.kind === "publish" ? "Publish" : "Reject") +
      ". No second or conflicting action was run.", 409);
  }

  let pending;
  try { pending = JSON.parse(claim.payload); }
  catch (error) {
    logError("moderation_payload_invalid", { action: act, error: errorMessage(error) });
    return page("Manual follow-up required",
      "The choice was safely claimed, but the stored submission could not be read. A board member must complete it manually.", 500);
  }
  const checked = validatePostBody(pending.b);
  if (checked.error) {
    logError("moderation_payload_validation_failed", { action: act, error: checked.error });
    return page("Manual follow-up required",
      "The choice was safely claimed, but the stored submission failed current validation. A board member must complete it manually.", 500);
  }
  pending.b = checked.value;
  pending.r = normalizeReview(pending.r);

  try {
    if (act === "publish") {
      const published = await appendPost(env, pending.b, pending.r);
      // GitHub is already updated at this point. A delivery failure must never
      // make this claimed moderation action retryable or publish twice.
      await notifyPublishedWithoutRollback(env, pending, published, ctx);
      await completeActionWithoutRollback(env, token, act);
      await deleteLegacyPendingPayload(env, token);
      console.log({ event: "post_published", category: published.category });
      return page("Post published",
        "“" + (pending.r.editedTitle || pending.b.title) + "” is on its way to the board — the site picks it up in a minute or two.");
    }
    await sendEmail(env, {
      to: pending.b.email, replyTo: env.BOARD_EMAIL,
      subject: "About your Fisher Hill board post",
      text: await draftRejection(env, pending)
    });
    await completeActionWithoutRollback(env, token, act);
    await deleteLegacyPendingPayload(env, token);
    return page("Rejection sent", "A polite note was emailed to " + pending.b.email + ".");
  } catch (e) {
    logError("moderation_side_effect_failed", { action: act, error: errorMessage(e) });
    return page("Manual follow-up required",
      "The choice was safely claimed, but automation could not finish it. It will not run again; a board member must complete it manually.", 500);
  }
}

function actionStub(env, token) {
  if (!env.MODERATION_ACTIONS || typeof env.MODERATION_ACTIONS.getByName !== "function")
    throw new Error("MODERATION_ACTIONS binding is unavailable");
  return env.MODERATION_ACTIONS.getByName(token);
}

async function callActionStub(env, token, operation, payload = {}) {
  const response = await actionStub(env, token).fetch("https://moderation-action.internal/" + operation, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Moderation ${operation} failed: ${response.status}`);
  return response.json();
}

async function initializeActionToken(env, token, payload, expiresAt, allowExisting = false) {
  const result = await callActionStub(env, token, "initialize", { payload, expiresAt });
  if (!result || typeof result.initialized !== "boolean" || typeof result.expired !== "boolean")
    throw new Error("Invalid moderation initialization response");
  if (!allowExisting && !result.initialized) throw new Error("Moderation token collision");
  if (result.expired) throw new Error("Moderation token expired during initialization");
  return result;
}

async function readActionToken(env, token) {
  let result = await callActionStub(env, token, "read");
  if (!result || typeof result.initialized !== "boolean" || typeof result.expired !== "boolean")
    throw new Error("Invalid moderation read response");
  if (result.initialized) return result;
  const legacy = await readLegacyPendingPayload(env, token);
  if (!legacy) return result;
  await initializeActionToken(env, token, legacy.payload, legacy.expiresAt, true);
  result = await callActionStub(env, token, "read");
  return result;
}

async function claimActionToken(env, token, kind) {
  let result = await callActionStub(env, token, "claim", { kind });
  if (!result || typeof result.initialized !== "boolean" || typeof result.claimed !== "boolean" ||
      typeof result.expired !== "boolean") throw new Error("Invalid moderation claim response");
  if (result.initialized) return result;
  const legacy = await readLegacyPendingPayload(env, token);
  if (!legacy) return result;
  await initializeActionToken(env, token, legacy.payload, legacy.expiresAt, true);
  result = await callActionStub(env, token, "claim", { kind });
  return result;
}

async function readLegacyPendingPayload(env, token) {
  if (!env.PENDING || typeof env.PENDING.get !== "function") return null;
  const payload = await env.PENDING.get("post:" + token);
  if (!payload) return null;
  let pending;
  try { pending = JSON.parse(payload); }
  catch (error) { throw new Error("Legacy pending payload is invalid"); }
  const received = Date.parse(pending.received || "");
  if (!Number.isFinite(received)) throw new Error("Legacy pending payload has no valid timestamp");
  const expiresAt = received + PENDING_TTL * 1000;
  return expiresAt > Date.now() ? { payload, expiresAt } : null;
}

async function completeActionWithoutRollback(env, token, kind) {
  try {
    const result = await callActionStub(env, token, "complete", { kind });
    if (!result || result.completed !== true) throw new Error("Moderation completion was not persisted");
  } catch (error) {
    // The external side effect already succeeded and the claim is permanent.
    logError("moderation_completion_failed", { action: kind, error: errorMessage(error) });
  }
}

async function deleteLegacyPendingPayload(env, token) {
  if (!env.PENDING || typeof env.PENDING.delete !== "function") return;
  try { await env.PENDING.delete("post:" + token); }
  catch (error) { logError("legacy_pending_cleanup_failed", { error: errorMessage(error) }); }
}

async function notifyPublishedWithoutRollback(env, pending, published, ctx) {
  const delivery = sendEmail(env, {
    to: pending.b.email,
    replyTo: env.BOARD_EMAIL,
    subject: `[FHA] Your post is live: ${published.title}`,
    text: `Good news — your Fisher Hill neighborhood post “${published.title}” was approved and published.\n\n` +
      `View the neighborhood board: ${env.SITE_POSTS_URL || "https://wp-cna.github.io/FHA/posts.html"}\n\n` +
      "It may take a minute or two for the latest version to appear.\n\n" +
      "— The Fisher Hill Association board"
  }).catch(error => {
    logError("publication_notice_failed", { error: errorMessage(error) });
  });

  try {
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(delivery);
    else await delivery;
  } catch (error) {
    // Defensive: even an unexpected execution-context error cannot undo a
    // GitHub commit that has already succeeded.
    logError("publication_notice_scheduling_failed", { error: errorMessage(error) });
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
  return new Response(html, {
    status: status || 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    }
  });
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
      logError("ai_review_request_failed", { status: response.status });
      return reviewFallback("The automated reviewer was unavailable; a board member should review this submission.");
    }
    const res = await response.json();
    const text = (res.content && res.content[0] && res.content[0].text) || "{}";
    const m = text.match(/\{[\s\S]*\}/);
    return normalizeReview(JSON.parse(m ? m[0] : text));
  } catch (error) {
    logError("ai_review_parse_failed", { error: errorMessage(error) });
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
  const published = buildPublishedPost(b, r);
  data.posts.unshift(published);
  data.updated = new Date().toISOString().slice(0, 10);
  const content = b64encode(JSON.stringify(data, null, 2) + "\n");
  const putRes = await fetch(api, {
    method: "PUT", headers: h,
    body: JSON.stringify({ message: `Add board post: ${b.title}`, content, sha: cur.sha })
  });
  if (!putRes.ok) throw new Error("GitHub write failed: " + putRes.status);
  return published;
}

function buildPublishedPost(b, r, today = new Date().toISOString().slice(0, 10)) {
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
  return {
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
    source: b.name,
    publicContact: publicContactValue(b)
  };
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
  const contact = publicContactValue(b);
  return `Type: ${b.postType}\nTitle: ${b.title}${when ? "\n" + when : ""}\n` +
    `Details: ${b.message}\n\nSubmitted by: ${b.name} <${b.email}>` +
    (contact ? `\nPublic contact (submitter approved for publication): ${contact}` : "\nPublic contact: (not provided)");
}
function errorMessage(error) { return String(error && error.message || error); }
function logError(event, details) {
  console.error({ event, ...(details || {}) });
}
function json(o, status, cors) {
  return new Response(JSON.stringify(o), { status: status || 200, headers: { "Content-Type": "application/json", ...cors } });
}
function b64encode(str) { const bytes = new TextEncoder().encode(str); let bin = ""; bytes.forEach(c => bin += String.fromCharCode(c)); return btoa(bin); }
function b64decode(b64) { const bin = atob(b64); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); }

export {
  boardRecipients,
  buildPublishedPost,
  claimModerationAction,
  completeModerationAction,
  enforceEmailRateLimit,
  enforceIpRateLimit,
  initializeModerationAction,
  normalizeReview,
  postFingerprint,
  publicContactKind,
  publicContactValue,
  readModerationAction,
  readSubmissionBody,
  reviewFallback,
  sha256,
  validateFields,
  validatePost,
  validatePostBody,
  validatePublicContact
};
