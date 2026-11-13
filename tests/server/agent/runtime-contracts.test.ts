import test from "node:test";
import assert from "node:assert/strict";
import { createWebCapabilityManifest, createWebInvocationEnvelope, createWebInvocationResult } from "../../../src/server/agent/runtime-contracts";

const capability = {
  id: "text.word_count",
  description: "Count words in supplied text.",
  permission: "local_text_read",
  sideEffect: false,
  inputSchema: {
    type: "object" as const,
    properties: { text: { type: "string", maxLength: 12000 } },
    required: ["text"],
    additionalProperties: false,
  },
  annotations: { idempotentHint: true, destructiveHint: false },
};

test("maps a registered backend tool into a valid web capability manifest", () => {
  const manifest = createWebCapabilityManifest(capability);
  assert.equal(manifest.runtime, "web");
  assert.equal(manifest.id, "text.word_count");
  assert.deepEqual(manifest.requiredPermissions, ["local_text_read"]);
  assert.equal(manifest.requiresUserApproval, false);
});

test("marks non-idempotent side-effecting tools as requiring approval", () => {
  const manifest = createWebCapabilityManifest({
    ...capability,
    id: "test.write",
    sideEffect: true,
    annotations: { idempotentHint: false, destructiveHint: false },
  });
  assert.equal(manifest.sideEffect, true);
  assert.equal(manifest.requiresUserApproval, true);
});

test("creates a bounded web invocation with a stable task/call idempotency key", () => {
  const now = Date.parse("2026-11-13T10:00:00.000Z");
  const invocation = createWebInvocationEnvelope({
    taskId: "123e4567-e89b-12d3-a456-426614174000",
    toolCallId: "call-1",
    toolId: capability.id,
    arguments: { text: "hello world" },
    capability,
    now,
  });
  assert.equal(invocation.targetRuntime, "web");
  assert.equal(invocation.targetDeviceId, null);
  assert.equal(invocation.expiresAt, "2026-11-13T10:10:00.000Z");
  assert.equal(invocation.idempotencyKey, "task:123e4567-e89b-12d3-a456-426614174000:call:call-1");
});

test("rejects an invocation whose tool and capability do not match", () => {
  assert.throws(() => createWebInvocationEnvelope({
    taskId: "123e4567-e89b-12d3-a456-426614174000",
    toolCallId: "call-1",
    toolId: "text.text_stats",
    arguments: { text: "hello" },
    capability,
    now: Date.parse("2026-11-13T10:00:00.000Z"),
  }));
});

test("normalizes completed and failed outcomes without replacing raw task evidence", () => {
  const invocation = createWebInvocationEnvelope({
    taskId: "123e4567-e89b-12d3-a456-426614174000",
    toolCallId: "call-1",
    toolId: capability.id,
    arguments: { text: "hello world" },
    capability,
    now: Date.parse("2026-11-13T10:00:00.000Z"),
  });
  const completed = createWebInvocationResult(invocation, "completed", undefined, Date.parse("2026-11-13T10:00:01.000Z"));
  assert.equal(completed.status, "completed");
  assert.equal(completed.errorCode, undefined);
  const failed = createWebInvocationResult(invocation, "failed", "TOOL_EXECUTION_FAILED", Date.parse("2026-11-13T10:00:02.000Z"));
  assert.equal(failed.status, "failed");
  assert.equal(failed.errorCode, "TOOL_EXECUTION_FAILED");
});
