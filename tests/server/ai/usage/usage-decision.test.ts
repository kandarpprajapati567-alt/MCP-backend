import assert from "node:assert/strict";
import test from "node:test";

import { parseAIUsageDecision } from "../../../../src/server/ai/usage/usage-decision";

test("parses an allowed quota reservation", () => {
  assert.deepEqual(parseAIUsageDecision([
    { allowed: true, retry_after_seconds: 0, reason: "ok" },
  ]), {
    allowed: true,
    retryAfterSeconds: 0,
    reason: "ok",
  });
});

test("parses a rejected quota reservation and rounds retry time up", () => {
  assert.deepEqual(parseAIUsageDecision([
    { allowed: false, retry_after_seconds: 12.2, reason: "minute_limit" },
  ]), {
    allowed: false,
    retryAfterSeconds: 13,
    reason: "minute_limit",
  });
});

test("clamps negative retry time to zero", () => {
  assert.equal(parseAIUsageDecision([
    { allowed: false, retry_after_seconds: -3, reason: "daily_limit" },
  ]).retryAfterSeconds, 0);
});

test("rejects missing, duplicate, or malformed RPC rows", () => {
  for (const value of [
    null,
    [],
    [{ allowed: true, retry_after_seconds: 0 }],
    [{ allowed: "true", retry_after_seconds: 0, reason: "ok" }],
    [{ allowed: true, retry_after_seconds: Number.NaN, reason: "ok" }],
    [{ allowed: true, retry_after_seconds: 0, reason: "" }],
    [
      { allowed: true, retry_after_seconds: 0, reason: "ok" },
      { allowed: true, retry_after_seconds: 0, reason: "ok" },
    ],
  ]) {
    assert.throws(() => parseAIUsageDecision(value), /invalid response/i);
  }
});
