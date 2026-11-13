import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidCapabilityManifestEntry,
  isValidInvocationEnvelope,
  isValidInvocationResult,
} from "../../../src/shared/agent/validation";

const capability = {
  id: "android.files.read",
  runtime: "android",
  manifestVersion: 1,
  description: "Read a user-selected file",
  inputSchema: { type: "object", properties: { uri: { type: "string" } }, required: ["uri"], additionalProperties: false },
  requiredPermissions: ["READ_FILES"],
  sideEffect: false,
  idempotent: true,
  requiresUserApproval: true,
};

const invocation = {
  contractVersion: 1,
  invocationId: "inv-123",
  taskId: "task-123",
  toolCallId: "call-1",
  targetRuntime: "android",
  targetDeviceId: "device-1",
  capabilityId: "android.files.read",
  arguments: { uri: "content://selected/document" },
  createdAt: "2026-11-12T10:00:00.000Z",
  expiresAt: "2026-11-12T10:05:00.000Z",
  idempotencyKey: "idem-123",
};

const result = {
  contractVersion: 1,
  invocationId: "inv-123",
  taskId: "task-123",
  toolCallId: "call-1",
  runtime: "android",
  status: "completed",
  result: { bytesRead: 12 },
  completedAt: "2026-11-12T10:01:00.000Z",
  evidence: [{ kind: "execution", source: "android.files.read", summary: "Read 12 bytes" }],
};

test("accepts a strict Android capability manifest", () => {
  assert.equal(isValidCapabilityManifestEntry(capability), true);
});

test("rejects a manifest that permits undeclared input properties", () => {
  assert.equal(isValidCapabilityManifestEntry({
    ...capability,
    inputSchema: { ...capability.inputSchema, additionalProperties: true },
  }), false);
});

test("rejects manifest required fields missing from properties", () => {
  assert.equal(isValidCapabilityManifestEntry({
    ...capability,
    inputSchema: { ...capability.inputSchema, required: ["missing"] },
  }), false);
});

test("accepts an unexpired, bounded Android invocation", () => {
  assert.equal(isValidInvocationEnvelope(invocation, Date.parse("2026-11-12T10:02:00.000Z")), true);
});

test("rejects Android invocations without a device target", () => {
  assert.equal(isValidInvocationEnvelope({ ...invocation, targetDeviceId: null }, Date.parse("2026-11-12T10:02:00.000Z")), false);
});

test("rejects expired or excessively long-lived invocations", () => {
  assert.equal(isValidInvocationEnvelope(invocation, Date.parse("2026-11-12T10:06:00.000Z")), false);
  assert.equal(isValidInvocationEnvelope({
    ...invocation,
    expiresAt: "2026-11-14T10:00:00.000Z",
  }, Date.parse("2026-11-12T10:02:00.000Z")), false);
});

test("rejects web invocations that target a phone device", () => {
  assert.equal(isValidInvocationEnvelope({
    ...invocation,
    targetRuntime: "web",
    targetDeviceId: "device-1",
  }, Date.parse("2026-11-12T10:02:00.000Z")), false);
});

test("accepts a completed result with bounded evidence", () => {
  assert.equal(isValidInvocationResult(result), true);
});

test("rejects a failed result that claims a successful output", () => {
  assert.equal(isValidInvocationResult({
    ...result,
    status: "failed",
  }), false);
});

test("rejects untrusted results with oversized evidence", () => {
  assert.equal(isValidInvocationResult({
    ...result,
    evidence: Array(21).fill(result.evidence[0]),
  }), false);
});

test("rejects nested or unsupported JSON Schema constructs", () => {
  assert.equal(isValidCapabilityManifestEntry({
    ...capability,
    inputSchema: {
      type: "object",
      properties: { value: { type: "object", properties: { nested: { type: "string" } } } },
      additionalProperties: false,
    },
  }), false);
});

test("rejects duplicate required keys", () => {
  assert.equal(isValidCapabilityManifestEntry({
    ...capability,
    inputSchema: { ...capability.inputSchema, required: ["uri", "uri"] },
  }), false);
});

test("rejects Android invocation without an explicit paired-device target", () => {
  assert.equal(isValidInvocationEnvelope({
    ...invocation,
    targetDeviceId: null,
  }, Date.parse("2026-11-12T10:02:00.000Z")), false);
});

test("rejects a result without evidence metadata", () => {
  const { evidence: _evidence, ...incomplete } = result;
  assert.equal(isValidInvocationResult(incomplete), false);
});

test("rejects unsupported property schema keywords", () => {
  assert.equal(isValidCapabilityManifestEntry({
    ...capability,
    inputSchema: {
      ...capability.inputSchema,
      properties: { uri: { type: "string", pattern: ".*" } },
    },
  }), false);
});


test("rejects duplicate capability permissions", () => {
  assert.equal(isValidCapabilityManifestEntry({
    ...capability,
    requiredPermissions: ["READ_FILES", "READ_FILES"],
  }), false);
});

test("rejects non-ISO and impossible calendar timestamps", () => {
  assert.equal(isValidInvocationEnvelope({
    ...invocation,
    createdAt: "November 12, 2026 10:00 UTC",
  }, Date.parse("2026-11-12T10:02:00.000Z")), false);
  assert.equal(isValidInvocationEnvelope({
    ...invocation,
    createdAt: "2026-02-30T10:00:00.000Z",
  }, Date.parse("2026-02-28T10:02:00.000Z")), false);
});

test("requires an error code for non-completed invocation results", () => {
  assert.equal(isValidInvocationResult({
    ...result,
    status: "failed",
    result: undefined,
    errorCode: "EXECUTION_FAILED",
  }), true);
  assert.equal(isValidInvocationResult({
    ...result,
    status: "failed",
    result: undefined,
  }), false);
});

test("rejects completed invocation results carrying an error code", () => {
  assert.equal(isValidInvocationResult({
    ...result,
    errorCode: "STALE_RESULT",
  }), false);
});
