import assert from "node:assert/strict";
import test from "node:test";
import { executeToolCallSafely } from "../../../src/server/agent/tool-call-execution";
import { safeAgentFailureMessage } from "../../../src/server/agent/failure-diagnostics";

test("captures one tool failure without preventing a later tool call", async () => {
  const calls: string[] = [];
  const first = await executeToolCallSafely(async () => {
    calls.push("missing-file");
    throw new Error("GitHub repository or requested resource was not found. Confirm repository access and the supplied ref/path.");
  });
  const second = await executeToolCallSafely(async () => {
    calls.push("package-json");
    return { content: '{"dependencies":{"next":"15.5.28"}}' };
  });

  assert.deepEqual(calls, ["missing-file", "package-json"]);
  assert.deepEqual(first, {
    ok: false,
    error: "GitHub repository or requested resource was not found. Confirm repository access and the supplied ref/path.",
  });
  assert.equal(second.ok, true);
  if (second.ok) assert.match(JSON.stringify(second.result), /15\.5\.28/);
});

test("keeps unknown internal exceptions sanitized", () => {
  assert.equal(
    safeAgentFailureMessage(new Error("database secret or stack details")),
    "Unexpected internal error. Check server logs using the task ID.",
  );
});
