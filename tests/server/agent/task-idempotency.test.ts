import assert from "node:assert/strict";
import test from "node:test";
import {
  createAgentTaskRequestFingerprint,
  isSameAgentTaskRequest,
  isValidAgentTaskIdempotencyKey,
} from "../../../src/server/agent/task-idempotency";

test("accepts bounded opaque idempotency keys", () => {
  assert.equal(isValidAgentTaskIdempotencyKey("request-2026.11:abc_123"), true);
  assert.equal(isValidAgentTaskIdempotencyKey(""), false);
  assert.equal(isValidAgentTaskIdempotencyKey("contains spaces"), false);
  assert.equal(isValidAgentTaskIdempotencyKey("x".repeat(129)), false);
});

test("fingerprint is stable for equivalent normalized task input", () => {
  const first = createAgentTaskRequestFingerprint("  research this  ", null);
  const second = createAgentTaskRequestFingerprint("research this", null);
  assert.equal(first, second);
  assert.equal(first.length, 64);
});

test("fingerprint binds the request to its selected Agent", () => {
  const first = createAgentTaskRequestFingerprint("research this", "agent-a");
  const second = createAgentTaskRequestFingerprint("research this", "agent-b");
  assert.notEqual(first, second);
});

test("only an exact valid stored fingerprint is treated as a replay", () => {
  const fingerprint = createAgentTaskRequestFingerprint("task", null);
  assert.equal(isSameAgentTaskRequest(fingerprint, fingerprint), true);
  assert.equal(isSameAgentTaskRequest("not-a-hash", fingerprint), false);
  assert.equal(isSameAgentTaskRequest(null, fingerprint), false);
});
