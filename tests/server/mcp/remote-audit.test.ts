import assert from "node:assert/strict";
import test from "node:test";
import {
  boundRemoteMcpContent,
  buildRemoteMcpAuditCompletedPatch,
  buildRemoteMcpAuditFailedPatch,
  buildRemoteMcpAuditPendingPatch,
  buildRemoteMcpAuditStartRecord,
  classifyRemoteMcpFailure,
  runRemoteMcpAuditedInvocation,
  type RemoteMcpAuditPersistence,
} from "../../../src/server/mcp/remote-audit";

const input = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  ownerId: "123e4567-e89b-42d3-a456-426614174001",
  serverId: "123e4567-e89b-42d3-a456-426614174002",
  toolId: "remote_mcp.123e4567-e89b-42d3-a456-426614174002.search_docs",
  toolName: "search_docs",
  source: "agent_task" as const,
  taskId: "123e4567-e89b-42d3-a456-426614174003",
  args: { query: "private search phrase", token: "never store this" },
  startedAt: "2026-11-14T00:00:00.000Z",
};

function persistence(overrides: Partial<RemoteMcpAuditPersistence> = {}) {
  const calls: Array<{ type: string; value: unknown }> = [];
  const result: RemoteMcpAuditPersistence = {
    async start(value) { calls.push({ type: "start", value }); },
    async complete(value) { calls.push({ type: "complete", value }); },
    async fail(value) { calls.push({ type: "fail", value }); },
    async pending(value) { calls.push({ type: "pending", value }); },
    ...overrides,
  };
  return { result, calls };
}

test("audit start stores only an argument digest and validates the optional task reference", () => {
  const record = buildRemoteMcpAuditStartRecord(input);
  assert.equal(record.status, "started");
  assert.equal(record.task_id, input.taskId);
  assert.match(record.argument_digest, /^[0-9a-f]{64}$/);
  assert.equal("args" in record, false);
  assert.equal(JSON.stringify(record).includes("private search phrase"), false);
  assert.equal(JSON.stringify(record).includes("never store this"), false);
  assert.equal(buildRemoteMcpAuditStartRecord({ ...input, taskId: "not-a-uuid" }).task_id, null);
});

test("audit completion metrics are clamped to database bounds", () => {
  const patch = buildRemoteMcpAuditCompletedPatch({
    completedAt: input.startedAt, durationMs: 999999, responseBytes: 9999999,
    outputBytes: 999999, contentItems: 99,
  });
  assert.deepEqual(
    { duration: patch.duration_ms, response: patch.response_bytes, output: patch.output_bytes, items: patch.content_items },
    { duration: 120000, response: 1048576, output: 98304, items: 12 },
  );
});

test("failure classification exposes stable codes instead of remote error text", () => {
  assert.equal(classifyRemoteMcpFailure(new Error("Remote MCP request timed out.")), "REMOTE_MCP_TIMEOUT");
  assert.equal(classifyRemoteMcpFailure(new Error("Remote MCP hostname DNS resolution failed.")), "REMOTE_MCP_DNS_REJECTED");
  assert.equal(classifyRemoteMcpFailure(new Error("Remote MCP redirects are not allowed.")), "REMOTE_MCP_REDIRECT_REJECTED");
  assert.equal(classifyRemoteMcpFailure(new Error("Remote MCP request failed with HTTP 502.")), "REMOTE_MCP_HTTP_ERROR");
  assert.equal(buildRemoteMcpAuditFailedPatch({ completedAt: input.startedAt, durationMs: 2, error: new Error("secret response body") }).error_code, "REMOTE_MCP_FAILED");
  assert.equal(buildRemoteMcpAuditPendingPatch({ completedAt: input.startedAt, durationMs: 2 }).status, "audit_pending");
});

test("remote output is bounded by item count and serialized UTF-8 JSON bytes", () => {
  const raw = Array.from({ length: 20 }, (_, index) => ({
    type: "text",
    text: ("😀\n\u0000" + index + "x").repeat(3000),
  }));
  raw.push({ type: "image", text: "ignored" } as { type: string; text: string });
  const bounded = boundRemoteMcpContent(raw);
  assert.equal(bounded.length, 12);
  assert.ok(Buffer.byteLength(JSON.stringify(bounded), "utf8") <= 80000);
  assert.ok(bounded.every((item) => Buffer.byteLength(JSON.stringify(item), "utf8") <= 6500));
});

test("audit start failure blocks the remote invocation", async () => {
  let invoked = false;
  const { result } = persistence({
    async start() { throw new Error("database unavailable"); },
  });
  await assert.rejects(
    runRemoteMcpAuditedInvocation(input, result, async () => {
      invoked = true;
      return { value: "unsafe", responseBytes: 1, outputBytes: 1, contentItems: 1 };
    }),
    /database unavailable/,
  );
  assert.equal(invoked, false);
});

test("failed remote invocation is recorded with a stable error code and never returned as success", async () => {
  const { result, calls } = persistence();
  await assert.rejects(
    runRemoteMcpAuditedInvocation(input, result, async () => { throw new Error("Remote MCP request timed out."); }),
    /timed out/,
  );
  assert.deepEqual(calls.map((call) => call.type), ["start", "fail"]);
  assert.equal((calls[1].value as { error_code: string }).error_code, "REMOTE_MCP_TIMEOUT");
});

test("successful invocation is returned only after audit completion is persisted", async () => {
  const { result, calls } = persistence();
  const value = await runRemoteMcpAuditedInvocation(input, result, async () => ({
    value: { ok: true }, responseBytes: 128, outputBytes: 64, contentItems: 2,
  }));
  assert.deepEqual(value, { ok: true });
  assert.deepEqual(calls.map((call) => call.type), ["start", "complete"]);
  assert.equal((calls[1].value as { status: string }).status, "completed");
});

test("failed audit finalization attempts audit_pending and withholds the result", async () => {
  const { result, calls } = persistence({
    async complete() { throw new Error("database update failed"); },
  });
  await assert.rejects(
    runRemoteMcpAuditedInvocation(input, result, async () => ({
      value: { ok: true }, responseBytes: 128, outputBytes: 64, contentItems: 2,
    })),
    /audit outcome could not be confirmed/,
  );
  assert.deepEqual(calls.map((call) => call.type), ["start", "pending"]);
  assert.equal((calls[1].value as { error_code: string }).error_code, "AUDIT_FINALIZATION_FAILED");
});
