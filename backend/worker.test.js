import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
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
  validatePublicContact,
  validatePost
} from "./worker.js";
import worker from "./worker.js";

const validPost = {
  postType: "Local business or service",
  title: "Neighborhood bakery opening",
  message: "A local bakery is opening Saturday with bread, pastries, and posted prices.",
  name: "A Neighbor",
  email: "neighbor@example.com",
  publicContact: "public@example.com",
  eventDate: "",
  location: "Fisher Hill"
};

const validContact = {
  name: "Test Neighbor",
  email: "neighbor@example.com",
  subject: "Question",
  message: "Could someone from the board please follow up?"
};

const validJoin = {
  name: "Test Neighbor",
  email: "neighbor@example.com",
  residency: "current",
  address: "10 Example Street",
  membership: "individual",
  note: "Glad to join."
};

function passingRateBindings() {
  return {
    IP_RATE_LIMITER: { limit: async () => ({ success: true }) },
    EMAIL_RATE_LIMITER: { limit: async () => ({ success: true }) }
  };
}

function jsonRequest(path, body, headers = {}) {
  return new Request("https://example.test" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "192.0.2.10",
      ...headers
    },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

function jsonResponder(payload, status) {
  return Response.json(payload, { status });
}

function createActionNamespace() {
  const records = new Map();
  const calls = [];
  const binding = {
    getByName(token) {
      return {
        async fetch(input, init) {
          const request = input instanceof Request ? input : new Request(input, init);
          const operation = new URL(request.url).pathname.slice(1);
          const body = await request.json();
          const now = Date.now();
          let record = records.get(token) || null;
          calls.push({ token, operation });

          if (operation === "initialize") {
            if (!record && now < body.expiresAt) {
              record = {
                payload: body.payload,
                expiresAt: body.expiresAt,
                kind: null,
                claimedAt: null,
                completedAt: null
              };
              records.set(token, record);
              return Response.json({ initialized: true, expired: false, state: stateOf(record) });
            }
            return Response.json({
              initialized: false,
              expired: !record || now >= record.expiresAt,
              state: record ? stateOf(record) : null
            });
          }
          if (operation === "read") {
            return Response.json(record ? {
              initialized: true,
              expired: now >= record.expiresAt,
              state: stateOf(record),
              payload: record.payload
            } : { initialized: false, expired: false, state: null, payload: null });
          }
          if (operation === "claim") {
            if (!record) return Response.json({ initialized: false, claimed: false, expired: false, state: null, payload: null });
            if (now >= record.expiresAt)
              return Response.json({ initialized: true, claimed: false, expired: true, state: stateOf(record), payload: null });
            if (record.kind)
              return Response.json({ initialized: true, claimed: false, expired: false, state: stateOf(record), payload: null });
            record.kind = body.kind;
            record.claimedAt = now;
            return Response.json({ initialized: true, claimed: true, expired: false, state: stateOf(record), payload: record.payload });
          }
          if (operation === "complete") {
            const completed = !!record && record.kind === body.kind;
            if (completed) {
              record.payload = null;
              record.completedAt = now;
            }
            return Response.json({ completed, state: record ? stateOf(record) : null });
          }
          return Response.json({ error: "not found" }, { status: 404 });
        }
      };
    }
  };

  function stateOf(record) {
    return {
      kind: record.kind,
      claimedAt: record.claimedAt,
      expiresAt: record.expiresAt,
      completedAt: record.completedAt
    };
  }

  return {
    binding,
    records,
    calls,
    seed(token, payload, expiresAt = Date.now() + 60_000) {
      records.set(token, { payload, expiresAt, kind: null, claimedAt: null, completedAt: null });
    }
  };
}

function fakeSql() {
  let row = null;
  const cursor = rows => ({ toArray: () => rows, one: () => rows[0] });
  return {
    exec(query, ...args) {
      const sql = query.replace(/\s+/g, " ").trim();
      if (sql.startsWith("SELECT payload")) return cursor(row ? [{ ...row }] : []);
      if (sql.startsWith("INSERT INTO moderation_state")) {
        row = { payload: args[0], expiresAt: args[1], kind: null, claimedAt: null, completedAt: null };
        return cursor([]);
      }
      if (sql.startsWith("UPDATE moderation_state SET kind")) {
        if (row && row.kind == null) { row.kind = args[0]; row.claimedAt = args[1]; }
        return cursor([]);
      }
      if (sql.startsWith("UPDATE moderation_state SET payload")) {
        if (row && row.kind === args[1]) { row.payload = null; row.completedAt = args[0]; }
        return cursor([]);
      }
      if (sql.startsWith("DELETE FROM moderation_state")) { row = null; return cursor([]); }
      throw new Error("Unexpected SQL: " + sql);
    }
  };
}

function pendingPayload(overrides = {}) {
  return JSON.stringify({
    b: { ...validPost, ...(overrides.b || {}) },
    r: {
      decision: "APPROVE",
      reason: "A suitable local announcement.",
      failedCriteria: [],
      editedTitle: null,
      editedBody: null,
      confidence: 0.95,
      ...(overrides.r || {})
    },
    received: overrides.received || new Date().toISOString()
  });
}

test("board notifications deduplicate configured recipients", () => {
  assert.deepEqual(
    boardRecipients({
      BOARD_EMAIL: "fha.wp.info@gmail.com",
      BOARD_EMAILS: "fha.wp.info@gmail.com, michael@mdalton.com, fha.wp.info@gmail.com"
    }),
    ["fha.wp.info@gmail.com", "michael@mdalton.com"]
  );
});

test("valid JSON contact is bounded, normalized, and sent to every moderator", async () => {
  const originalFetch = globalThis.fetch;
  let resendPayload;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    resendPayload = JSON.parse(options.body);
    return Response.json({ id: "email_test" });
  };
  try {
    const response = await worker.fetch(jsonRequest("/contact", {
      ...validContact,
      name: "  Test Neighbor  ",
      email: "NEIGHBOR@EXAMPLE.COM"
    }), {
      ...passingRateBindings(),
      ALLOWED_ORIGIN: "https://example.test",
      BOARD_EMAIL: "fha.wp.info@gmail.com",
      BOARD_EMAILS: "michael@mdalton.com,michael.kushman@gmail.com",
      MAIL_FROM: "FHA Board <notifications@mail.wp-cna.org>",
      RESEND_API_KEY: "test-key"
    });
    assert.equal(response.status, 200);
    assert.deepEqual(resendPayload.to, [
      "fha.wp.info@gmail.com", "michael@mdalton.com", "michael.kushman@gmail.com"
    ]);
    assert.equal(resendPayload.reply_to, "neighbor@example.com");
    assert.match(resendPayload.text, /^From: Test Neighbor/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("valid membership request reaches Resend with enumerated server-side values", async () => {
  const originalFetch = globalThis.fetch;
  let resendPayload;
  globalThis.fetch = async (url, options) => {
    resendPayload = JSON.parse(options.body);
    return Response.json({ id: "join_test" });
  };
  try {
    const response = await worker.fetch(jsonRequest("/join", validJoin), {
      ...passingRateBindings(),
      BOARD_EMAIL: "fha.wp.info@gmail.com",
      MAIL_FROM: "FHA Board <notifications@mail.wp-cna.org>",
      RESEND_API_KEY: "test-key"
    });
    assert.equal(response.status, 200);
    assert.match(resendPayload.text, /Current Fisher Hill resident/);
    assert.match(resendPayload.text, /Individual — \$5\/year/);
    assert.equal(resendPayload.reply_to, validJoin.email);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("posting initializes its authoritative Durable Object before emailing moderators", async () => {
  const originalFetch = globalThis.fetch;
  const actions = createActionNamespace();
  const legacy = new Map();
  let resendPayload;
  globalThis.fetch = async (url, options) => {
    if (url === "https://api.anthropic.com/v1/messages") {
      return Response.json({ content: [{ type: "text", text: JSON.stringify({
        decision: "APPROVE", reason: "A suitable local announcement.", failedCriteria: [],
        editedTitle: null, editedBody: null, confidence: 0.95
      }) }] });
    }
    resendPayload = JSON.parse(options.body);
    return Response.json({ id: "posting_email_test" });
  };
  try {
    const response = await worker.fetch(jsonRequest("/post", validPost), {
      ...passingRateBindings(),
      BOARD_EMAIL: "fha.wp.info@gmail.com",
      BOARD_EMAILS: "michael@mdalton.com,michael.kushman@gmail.com",
      MAIL_FROM: "FHA Board <notifications@mail.wp-cna.org>",
      RESEND_API_KEY: "test-resend-key",
      ANTHROPIC_API_KEY: "test-anthropic-key",
      MODERATION_ACTIONS: actions.binding,
      PENDING: { put: async (key, value) => legacy.set(key, value) }
    });
    assert.equal(response.status, 200);
    assert.equal(actions.records.size, 1);
    const [token, record] = [...actions.records.entries()][0];
    assert.match(record.payload, /public@example\.com/);
    assert.equal(legacy.has("post:" + token), true);
    assert.match(resendPayload.text, /APPROVE & PUBLISH \(confirmation required\)/);
    assert.match(resendPayload.text, /first confirmed choice is atomically claimed/i);
    assert.match(resendPayload.text, /Public contact \(submitter approved for publication\): public@example\.com/);

    // Confirmation reads the strongly consistent DO even if legacy KV has not propagated.
    const confirmation = await worker.fetch(
      new Request(`https://example.test/action/publish?token=${token}`),
      { MODERATION_ACTIONS: actions.binding, PENDING: { get: async () => null } }
    );
    assert.equal(confirmation.status, 200);
    assert.match(await confirmation.text(), /Confirm: publish this post/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("native URL-encoded contact POST returns a safe HTML result page", async () => {
  const originalFetch = globalThis.fetch;
  let resendCalls = 0;
  globalThis.fetch = async () => { resendCalls += 1; return Response.json({ id: "native_contact" }); };
  try {
    const body = new URLSearchParams(validContact);
    const response = await worker.fetch(new Request("https://example.test/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml",
        "CF-Connecting-IP": "192.0.2.20"
      },
      body
    }), {
      ...passingRateBindings(),
      BOARD_EMAIL: "fha.wp.info@gmail.com",
      MAIL_FROM: "FHA Board <notifications@mail.wp-cna.org>",
      RESEND_API_KEY: "test-key"
    });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type"), /text\/html/);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
    assert.match(response.headers.get("Content-Security-Policy"), /form-action 'self'/);
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    assert.match(html, /Submission received/);
    assert.doesNotMatch(html, /neighbor@example\.com|Test Neighbor/);
    assert.equal(resendCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("filled current and legacy honeypots are delivered with a suspect tag", async () => {
  const originalFetch = globalThis.fetch;
  const subjects = [];
  globalThis.fetch = async (_url, init) => {
    subjects.push(JSON.parse(init.body).subject);
    return Response.json({ id: "suspect_contact" });
  };
  try {
    const env = {
      ...passingRateBindings(),
      BOARD_EMAIL: "fha.wp.info@gmail.com",
      MAIL_FROM: "FHA Board <notifications@mail.wp-cna.org>",
      RESEND_API_KEY: "test-key"
    };
    for (const honeypot of [{ fh_check: "autofilled.example" }, { website: "legacy-bot.example" }]) {
      const response = await worker.fetch(jsonRequest("/contact", { ...validContact, ...honeypot }), env);
      assert.equal(response.status, 200);
    }
    assert.equal(subjects.length, 2);
    assert.ok(subjects.every(subject => subject.startsWith("[SUSPECT] [FHA Contact]")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("native multipart membership POST is parsed after the streaming cap", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ id: "native_join" });
  try {
    const form = new FormData();
    Object.entries(validJoin).forEach(([key, value]) => form.set(key, value));
    const response = await worker.fetch(new Request("https://example.test/join", {
      method: "POST",
      headers: { "Accept": "text/html", "CF-Connecting-IP": "192.0.2.21" },
      body: form
    }), {
      ...passingRateBindings(),
      BOARD_EMAIL: "fha.wp.info@gmail.com",
      MAIL_FROM: "FHA Board <notifications@mail.wp-cna.org>",
      RESEND_API_KEY: "test-key"
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type"), /text\/html/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("static forms have real POST actions and the JavaScript payload keeps the legacy phone alias", async () => {
  for (const [file, route] of [["contact.html", "contact"], ["join.html", "join"], ["posts.html", "post"]]) {
    const source = await readFile(new URL("../" + file, import.meta.url), "utf8");
    assert.match(source, new RegExp(`<form[^>]+method="post"[^>]+action="https://fha-forms\\.fisher-hill\\.workers\\.dev/${route}"`));
    assert.doesNotMatch(source, /<form[^>]+novalidate/);
    assert.match(source, /<input[^>]+name="fh_check"/);
    assert.doesNotMatch(source, /<input[^>]+name="website"/);
  }
  const formsJs = await readFile(new URL("../forms.js", import.meta.url), "utf8");
  assert.match(formsJs, /data\.phone\s*=\s*data\.publicContact/);
  assert.match(formsJs, /new FormData\(f\).*data\[k\]\s*=\s*v/);
  assert.doesNotMatch(formsJs, /f\.website|k\s*!==\s*["']website/);
  assert.doesNotMatch(formsJs, /confirmation only/);
});

test("form routes never accept GET query data", async () => {
  const response = await worker.fetch(new Request(
    "https://example.test/contact?name=Leaked&email=private%40example.com&message=secret"
  ), {});
  assert.equal(response.status, 405);
  assert.doesNotMatch(await response.text(), /private|secret|Leaked/);
});

test("wrong content type and malformed or non-object JSON are rejected", async () => {
  const env = passingRateBindings();
  const wrong = await worker.fetch(new Request("https://example.test/contact", {
    method: "POST",
    headers: { "Content-Type": "text/plain", "CF-Connecting-IP": "192.0.2.30" },
    body: JSON.stringify(validContact)
  }), env);
  assert.equal(wrong.status, 415);

  const malformed = await worker.fetch(jsonRequest("/contact", "{not json"), env);
  assert.equal(malformed.status, 400);
  assert.match(await malformed.text(), /Malformed JSON/);

  const array = await worker.fetch(jsonRequest("/contact", []), env);
  assert.equal(array.status, 400);
});

test("the streaming reader rejects a chunked body over 16 KiB", async () => {
  const chunk = new Uint8Array(9 * 1024).fill(120);
  const body = new ReadableStream({
    start(controller) { controller.enqueue(chunk); controller.enqueue(chunk); controller.close(); }
  });
  const response = await worker.fetch(new Request("https://example.test/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.31" },
    body,
    duplex: "half"
  }), passingRateBindings());
  assert.equal(response.status, 413);
  assert.match(await response.text(), /too large/i);
});

test("contact schema rejects objects, bad email, unknown fields, and every configured overflow", async () => {
  const cases = [
    { ...validContact, name: { nested: true } },
    { ...validContact, name: "x".repeat(121) },
    { ...validContact, email: "not-an-email" },
    { ...validContact, subject: "x".repeat(161) },
    { ...validContact, message: "x".repeat(4001) },
    { ...validContact, fh_check: { nested: true } },
    { ...validContact, fh_check: "x".repeat(201) },
    { ...validContact, website: { nested: true } },
    { ...validContact, surprise: "field" }
  ];
  for (const body of cases) {
    const response = await worker.fetch(jsonRequest("/contact", body), passingRateBindings());
    assert.equal(response.status, 400);
  }
});

test("membership schema rejects invalid enum, type, address, note, and email values", async () => {
  const cases = [
    { ...validJoin, residency: "visitor" },
    { ...validJoin, membership: "lifetime" },
    { ...validJoin, address: "x".repeat(241) },
    { ...validJoin, note: "x".repeat(2001) },
    { ...validJoin, email: ["neighbor@example.com"] },
    { ...validJoin, name: "x\nInjected" }
  ];
  for (const body of cases) {
    const response = await worker.fetch(jsonRequest("/join", body), passingRateBindings());
    assert.equal(response.status, 400);
  }
});

test("invalid email is rejected before the email rate limiter is called", async () => {
  let emailCalls = 0;
  const response = await worker.fetch(jsonRequest("/contact", { ...validContact, email: "bad" }), {
    IP_RATE_LIMITER: { limit: async () => ({ success: true }) },
    EMAIL_RATE_LIMITER: { limit: async () => { emailCalls += 1; return { success: true }; } }
  });
  assert.equal(response.status, 400);
  assert.equal(emailCalls, 0);
});

test("missing or unavailable rate-limit bindings fail closed", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    // Malformed JSON would be 400 if the body were parsed before the missing IP binding.
    const missing = await worker.fetch(jsonRequest("/contact", "{not json"), {});
    assert.equal(missing.status, 503);

    const unavailable = await worker.fetch(jsonRequest("/contact", validContact), {
      IP_RATE_LIMITER: { limit: async () => ({ success: true }) },
      EMAIL_RATE_LIMITER: { limit: async () => { throw new Error("binding outage"); } }
    });
    assert.equal(unavailable.status, 503);
  } finally {
    console.error = originalConsoleError;
  }
});

test("parallel native IP limiter calls admit twenty and reject the rest", async () => {
  let count = 0;
  const limiter = { limit: async () => ({ success: ++count <= 20 }) };
  const request = new Request("https://example.test/contact", {
    headers: { "CF-Connecting-IP": "192.0.2.40" }
  });
  const results = await Promise.all(Array.from({ length: 24 }, () =>
    enforceIpRateLimit({ IP_RATE_LIMITER: limiter }, request, jsonResponder)
  ));
  assert.equal(results.filter(value => value === null).length, 20);
  assert.equal(results.filter(value => value && value.status === 429).length, 4);
});

test("parallel native email limiter calls admit five and reject the rest", async () => {
  let count = 0;
  const limiter = { limit: async () => ({ success: ++count <= 5 }) };
  const results = await Promise.all(Array.from({ length: 8 }, () =>
    enforceEmailRateLimit({ EMAIL_RATE_LIMITER: limiter }, "neighbor@example.com", jsonResponder)
  ));
  assert.equal(results.filter(value => value === null).length, 5);
  assert.equal(results.filter(value => value && value.status === 429).length, 3);
});

test("post validation enforces substance, date, types, bounds, and known fields", () => {
  assert.equal(validatePost(validPost), null);
  assert.match(validatePost({ ...validPost, message: "https://example.com" }), /description|detail/);
  assert.match(validatePost({ ...validPost, postType: "Neighborhood event", eventDate: "2026-02-31" }), /date/);
  assert.equal(validatePost({ ...validPost, postType: "Neighborhood event", eventDate: "2026-09-19" }), null);
  assert.match(validatePost({ ...validPost, location: { nested: true } }), /text/);
  assert.match(validatePost({ ...validPost, eventTime: "x".repeat(61) }), /long/);
  assert.match(validatePost({ ...validPost, unexpected: "field" }), /Unexpected/);
});

test("public contact accepts bounded phone, email, and secure website values", () => {
  assert.equal(publicContactKind("public@example.com"), "email");
  assert.equal(publicContactKind("+1 (914) 555-1212 ext. 4"), "phone");
  assert.equal(publicContactKind("https://example.com/contact"), "url");
  assert.equal(publicContactKind("example.com/contact"), "url");
  assert.equal(validatePublicContact(""), null);
  assert.match(validatePublicContact("http://example.com"), /https/);
  assert.match(validatePublicContact("public@example.com?subject=injected"), /valid public/);
  assert.match(validatePublicContact("https://user:password@example.com"), /valid public/);
  assert.match(validatePublicContact("x".repeat(255)), /254/);
});

test("legacy phone submissions populate published public contact and dedupe identically", () => {
  const { publicContact: omitted, ...withoutPublicContact } = validPost;
  const legacy = { ...withoutPublicContact, phone: "(914) 555-1212" };
  assert.equal(validatePost(legacy), null);
  assert.equal(publicContactValue(legacy), "(914) 555-1212");
  assert.equal(
    postFingerprint(legacy),
    postFingerprint({ ...withoutPublicContact, publicContact: "(914) 555-1212" })
  );
  assert.equal(
    buildPublishedPost(legacy, { editedTitle: null, editedBody: null }, "2026-08-14").publicContact,
    "(914) 555-1212"
  );
});

test("contact changes are part of exact-post deduplication", () => {
  assert.notEqual(postFingerprint(validPost), postFingerprint({ ...validPost, publicContact: "https://example.com" }));
});

test("AI output is bounded and invalid decisions fail safely to human review", () => {
  assert.equal(normalizeReview({ decision: "AUTO_PUBLISH", reason: "Looks fine" }).decision, "ESCALATE");
  const review = normalizeReview({
    decision: "APPROVE_WITH_EDITS", reason: "Fine", failedCriteria: ["privacy", 42],
    editedTitle: "x".repeat(200), editedBody: "y".repeat(1000), confidence: 8
  });
  assert.equal(review.editedTitle.length, 120);
  assert.equal(review.editedBody.length, 900);
  assert.deepEqual(review.failedCriteria, ["privacy"]);
  assert.equal(review.confidence, 1);
});

test("SQLite claim helpers persist payload first and allow only the first action", () => {
  const sql = fakeSql();
  assert.deepEqual(initializeModerationAction(sql, "payload", 1000, 100), {
    initialized: true, expired: false, state: { kind: null, claimedAt: null, expiresAt: 1000 }
  });
  const first = claimModerationAction(sql, "publish", 200);
  const second = claimModerationAction(sql, "reject", 201);
  assert.equal(first.claimed, true);
  assert.equal(first.payload, "payload");
  assert.equal(second.claimed, false);
  assert.equal(second.state.kind, "publish");
  assert.equal(completeModerationAction(sql, "publish", 300).completed, true);
  assert.equal(readModerationAction(sql, 400).payload, null);
});

test("legacy KV action payload is initialized into the DO before confirmation", async () => {
  const token = "b".repeat(32);
  const raw = pendingPayload();
  const actions = createActionNamespace();
  const response = await worker.fetch(
    new Request(`https://example.test/action/publish?token=${token}`),
    {
      MODERATION_ACTIONS: actions.binding,
      PENDING: { get: async key => key === "post:" + token ? raw : null }
    }
  );
  assert.equal(response.status, 200);
  assert.equal(actions.records.get(token).payload, raw);
  assert.deepEqual(actions.calls.map(call => call.operation), ["read", "initialize", "read"]);
});

test("publish persists contact; approval-email failure cannot undo the claim or publication", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  const token = "a".repeat(32);
  const actions = createActionNamespace();
  actions.seed(token, pendingPayload());
  const background = [];
  let githubWrite;
  let deleted = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("api.github.com") && options.method !== "PUT") {
      return Response.json({ sha: "old-sha", content: btoa(JSON.stringify({ updated: "2026-08-13", posts: [] })) });
    }
    if (String(url).includes("api.github.com") && options.method === "PUT") {
      const payload = JSON.parse(options.body);
      const binary = atob(payload.content);
      githubWrite = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0))));
      return Response.json({ content: { sha: "new-sha" } });
    }
    if (url === "https://api.resend.com/emails") return new Response("outage", { status: 503 });
    throw new Error("Unexpected fetch: " + url);
  };
  console.error = () => {};
  console.log = () => {};
  try {
    const response = await worker.fetch(
      new Request(`https://example.test/action/publish?token=${token}`, { method: "POST" }),
      {
        BOARD_EMAIL: "fha.wp.info@gmail.com",
        GITHUB_REPO: "wp-cna/FHA",
        GITHUB_TOKEN: "test-github-key",
        MAIL_FROM: "FHA Board <notifications@mail.wp-cna.org>",
        RESEND_API_KEY: "test-resend-key",
        SITE_POSTS_URL: "https://wp-cna.github.io/FHA/posts.html",
        MODERATION_ACTIONS: actions.binding,
        PENDING: { delete: async () => { deleted += 1; } }
      },
      { waitUntil: promise => background.push(promise) }
    );
    assert.equal(response.status, 200);
    assert.equal(githubWrite.posts[0].publicContact, "public@example.com");
    await Promise.all(background);
    assert.equal(actions.records.get(token).kind, "publish");
    assert.equal(actions.records.get(token).payload, null);
    assert.equal(deleted, 1);
  } finally {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    globalThis.fetch = originalFetch;
  }
});

test("parallel confirmations produce one atomic claim and one GitHub side effect", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const token = "c".repeat(32);
  const actions = createActionNamespace();
  actions.seed(token, pendingPayload());
  let githubWrites = 0;
  let deletes = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("api.github.com") && options.method !== "PUT")
      return Response.json({ sha: "old", content: btoa(JSON.stringify({ posts: [] })) });
    if (String(url).includes("api.github.com") && options.method === "PUT") {
      githubWrites += 1;
      return Response.json({ content: { sha: "new" } });
    }
    if (url === "https://api.resend.com/emails") return Response.json({ id: "notice" });
    throw new Error("Unexpected fetch: " + url);
  };
  console.log = () => {};
  try {
    const env = {
      BOARD_EMAIL: "fha.wp.info@gmail.com",
      GITHUB_REPO: "wp-cna/FHA",
      GITHUB_TOKEN: "token",
      MAIL_FROM: "FHA Board <notifications@mail.wp-cna.org>",
      RESEND_API_KEY: "resend",
      MODERATION_ACTIONS: actions.binding,
      PENDING: { delete: async () => { deletes += 1; } }
    };
    const responses = await Promise.all([
      worker.fetch(new Request(`https://example.test/action/publish?token=${token}`, { method: "POST" }), env),
      worker.fetch(new Request(`https://example.test/action/reject?token=${token}`, { method: "POST" }), env)
    ]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    assert.equal(githubWrites, 1);
    assert.equal(deletes, 1);
    assert.equal(actions.records.get(token).kind, "publish");
  } finally {
    console.log = originalConsoleLog;
    globalThis.fetch = originalFetch;
  }
});

test("failed publish remains claimed for manual handling and GET does not invite retry", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const token = "d".repeat(32);
  const actions = createActionNamespace();
  actions.seed(token, pendingPayload());
  let deletes = 0;
  globalThis.fetch = async url => {
    if (String(url).includes("api.github.com")) return new Response("failure", { status: 500 });
    throw new Error("Unexpected fetch: " + url);
  };
  console.error = () => {};
  try {
    const env = {
      GITHUB_REPO: "wp-cna/FHA",
      GITHUB_TOKEN: "token",
      MODERATION_ACTIONS: actions.binding,
      PENDING: { delete: async () => { deletes += 1; } }
    };
    const first = await worker.fetch(
      new Request(`https://example.test/action/publish?token=${token}`, { method: "POST" }), env
    );
    assert.equal(first.status, 500);
    assert.match(await first.text(), /Manual follow-up required/);
    assert.equal(actions.records.get(token).kind, "publish");
    assert.notEqual(actions.records.get(token).payload, null);
    assert.equal(deletes, 0);

    const get = await worker.fetch(new Request(`https://example.test/action/publish?token=${token}`), env);
    assert.equal(get.status, 409);
    assert.match(await get.text(), /Action already claimed/);

    const second = await worker.fetch(
      new Request(`https://example.test/action/publish?token=${token}`, { method: "POST" }), env
    );
    assert.equal(second.status, 409);
  } finally {
    console.error = originalConsoleError;
    globalThis.fetch = originalFetch;
  }
});

test("only documented endpoint paths are accepted without consuming form limits", async () => {
  let calls = 0;
  const response = await worker.fetch(jsonRequest("/not-really/contact", validContact), {
    IP_RATE_LIMITER: { limit: async () => { calls += 1; return { success: true }; } }
  });
  assert.equal(response.status, 404);
  assert.equal(calls, 0);
});
