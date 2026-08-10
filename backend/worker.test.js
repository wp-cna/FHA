import assert from "node:assert/strict";
import test from "node:test";

import {
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
