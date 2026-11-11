import assert from "node:assert/strict";
import test from "node:test";
import {
  executeToolCallsSequentially,
} from "../../../src/server/agent/tool-call-execution";
import { safeAgentFailureMessage } from "../../../src/server/agent/failure-diagnostics";

test("continues through the planned sequence after an earlier tool fails", async () => {
  const calls: string[] = [];
  const outcomes = await executeToolCallsSequentially(
    ["missing-file", "package-json"],
    async (tool) => {
      calls.push(tool);
      if (tool === "missing-file") {
        throw new Error(
          "GitHub repository or requested resource was not found. Confirm repository access and the supplied ref/path.",
        );
      }
      return { content: '{"dependencies":{"next":"15.5.28"}}' };
    },
  );

  assert.deepEqual(calls, ["missing-file", "package-json"]);
  assert.equal(outcomes.length, 2);
  assert.deepEqual(outcomes[0], {
    call: "missing-file",
    execution: {
      ok: false,
      error:
        "GitHub repository or requested resource was not found. Confirm repository access and the supplied ref/path.",
    },
  });
  assert.equal(outcomes[1].call, "package-json");
  assert.equal(outcomes[1].execution.ok, true);
  if (outcomes[1].execution.ok) {
    assert.match(JSON.stringify(outcomes[1].execution.result), /15\.5\.28/);
  }
});

test("keeps unknown internal exceptions sanitized", () => {
  assert.equal(
    safeAgentFailureMessage(new Error("database secret or stack details")),
    "Unexpected internal error. Check server logs using the task ID.",
  );
});
