import assert from "node:assert/strict";
import test from "node:test";

import {
  boardRecipients,
  enforceRateLimits,
  normalizeReview,
  postFingerprint,
  validatePost
} from "./worker.js";
import worker from "./worker.js";

const validPost = {
  postType: "Local business or service",
  title: "Neighborhood bakery opening",
  message: "A local bakery is opening Saturday with bread, pastries, and posted prices.",
  name: "A Neighbor",
  email: "neighbor@example.com",
  eventDate: "",
  location: "Fisher Hill"
};

test("board notifications go to both moderators without duplicate recipients", () => {
  assert.deepEqual(
    boardRecipients({
      BOARD_EMAIL: "fha.wp.info@gmail.com",
      BOARD_EMAILS: "fha.wp.info@gmail.com, michael@mdalton.com, fha.wp.info@gmail.com"
    }),
    ["fha.wp.info@gmail.com", "michael@mdalton.com"]
  );
});

test("board recipients fall back to the primary reply address", () => {
  assert.deepEqual(
    boardRecipients({ BOARD_EMAIL: "fha.wp.info@gmail.com" }),
    ["fha.wp.info@gmail.com"]
  );
});

test("contact submissions send one Resend message to all three recipients", async () => {
  const originalFetch = globalThis.fetch;
  let resendPayload;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    resendPayload = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: "email_test" }), { status: 200 });
  };

  try {
    const request = new Request("https://example.test/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Neighbor",
        email: "neighbor@example.com",
        subject: "Question",
        message: "Could someone from the board please follow up?"
      })
    });
    const response = await worker.fetch(request, {
      ALLOWED_ORIGIN: "https://example.test",
      BOARD_EMAIL: "fha.wp.info@gmail.com",
      BOARD_EMAILS: "michael@mdalton.com,michael.kushman@gmail.com",
      MAIL_FROM: "FHA Board <notifications@mail.wp-cna.org>",
      RESEND_API_KEY: "test-key"
    });

    assert.equal(response.status, 200);
    assert.deepEqual(resendPayload.to, [
      "fha.wp.info@gmail.com",
      "michael@mdalton.com",
      "michael.kushman@gmail.com"
    ]);
    assert.equal(resendPayload.reply_to, "neighbor@example.com");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("posting submissions email every moderator with the two standard actions", async () => {
  const originalFetch = globalThis.fetch;
  let resendPayload;
  const pending = new Map();
  globalThis.fetch = async (url, options) => {
    if (url === "https://api.anthropic.com/v1/messages") {
      return Response.json({
        content: [{
          type: "text",
          text: JSON.stringify({
            decision: "APPROVE",
            reason: "A suitable local announcement.",
            failedCriteria: [],
            editedTitle: null,
            editedBody: null,
            confidence: 0.95
          })
        }]
      });
    }
    assert.equal(url, "https://api.resend.com/emails");
    resendPayload = JSON.parse(options.body);
    return Response.json({ id: "posting_email_test" });
  };

  try {
    const request = new Request("https://example.test/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPost)
    });
    const response = await worker.fetch(request, {
      ALLOWED_ORIGIN: "https://example.test",
      BOARD_EMAIL: "fha.wp.info@gmail.com",
      BOARD_EMAILS: "michael@mdalton.com,michael.kushman@gmail.com",
      MAIL_FROM: "FHA Board <notifications@mail.wp-cna.org>",
      RESEND_API_KEY: "test-resend-key",
      ANTHROPIC_API_KEY: "test-anthropic-key",
      PENDING: {
        put: async (key, value) => pending.set(key, value)
      }
    });

    assert.equal(response.status, 200);
    assert.equal(pending.size, 1);
    assert.deepEqual(resendPayload.to, [
      "fha.wp.info@gmail.com",
      "michael@mdalton.com",
      "michael.kushman@gmail.com"
    ]);
    assert.match(resendPayload.text, /AI VETTING/);
    assert.match(resendPayload.text, /APPROVE & PUBLISH \(one click\)/);
    assert.match(resendPayload.text, /https:\/\/example\.test\/action\/publish\?token=/);
    assert.match(resendPayload.text, /REJECT & NOTIFY SUBMITTER \(one click\)/);
    assert.match(resendPayload.text, /https:\/\/example\.test\/action\/reject\?token=/);
    assert.match(resendPayload.text, /SUBMISSION DETAILS/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the permissive policy accepts a substantive local business announcement", () => {
  assert.equal(validatePost({ ...validPost }), null);
});

test("link-only and undersized submissions stop before the AI review", () => {
  assert.match(
    validatePost({ ...validPost, message: "https://example.com" }),
    /description|detail/
  );
});

test("neighborhood events require a valid event date", () => {
  assert.match(
    validatePost({ ...validPost, postType: "Neighborhood event", eventDate: "2026-02-31" }),
    /date/
  );
  assert.equal(
    validatePost({ ...validPost, postType: "Neighborhood event", eventDate: "2026-09-19" }),
    null
  );
});

test("an invalid AI decision fails safely to human review", () => {
  const review = normalizeReview({ decision: "AUTO_PUBLISH", reason: "Looks fine" });
  assert.equal(review.decision, "ESCALATE");
  assert.equal(review.confidence, 0);
});

test("AI output is bounded before it reaches email or GitHub", () => {
  const review = normalizeReview({
    decision: "APPROVE_WITH_EDITS",
    reason: "Fine",
    failedCriteria: ["privacy", 42],
    editedTitle: "x".repeat(200),
    editedBody: "y".repeat(1000),
    confidence: 8
  });
  assert.equal(review.editedTitle.length, 120);
  assert.equal(review.editedBody.length, 900);
  assert.deepEqual(review.failedCriteria, ["privacy"]);
  assert.equal(review.confidence, 1);
});

test("exact-post fingerprints ignore harmless case and whitespace changes", () => {
  const a = postFingerprint({ ...validPost });
  const b = postFingerprint({
    ...validPost,
    title: "  NEIGHBORHOOD   BAKERY OPENING ",
    message: "A LOCAL BAKERY IS OPENING SATURDAY WITH BREAD, PASTRIES, AND POSTED PRICES."
  });
  assert.equal(a, b);
});

test("sender rate limiting activates after five requests in an hour", async () => {
  const values = new Map();
  const kv = {
    get: async key => values.get(key) || null,
    put: async (key, value) => values.set(key, value)
  };
  const request = new Request("https://example.test/post", {
    method: "POST",
    headers: { "CF-Connecting-IP": "192.0.2.1" }
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(
      await enforceRateLimits({ RATE_LIMIT: kv }, "/post", validPost, request, {}),
      null
    );
  }
  const response = await enforceRateLimits({ RATE_LIMIT: kv }, "/post", validPost, request, {});
  assert.equal(response.status, 429);
});

test("a temporary rate-limit storage error does not take the forms offline", async () => {
  const kv = { get: async () => { throw new Error("temporary outage"); } };
  const request = new Request("https://example.test/post", { method: "POST" });
  assert.equal(
    await enforceRateLimits({ RATE_LIMIT: kv }, "/post", validPost, request, {}),
    null
  );
});

test("only documented endpoint paths are accepted", async () => {
  const request = new Request("https://example.test/not-really/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test", email: "test@example.com", message: "Hello there" })
  });
  const response = await worker.fetch(request, {});
  assert.equal(response.status, 404);
});
