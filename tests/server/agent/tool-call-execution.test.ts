import assert from "node:assert/strict";
import test from "node:test";
import { executeToolCallsSequentially, executeToolCallsWithConcurrency } from "../../../src/server/agent/tool-call-execution";
import { safeAgentFailureMessage } from "../../../src/server/agent/failure-diagnostics";

test("continues through planned calls after a tool failure and persists each outcome in order", async () => {
  const calls: string[] = [];
  const persisted: string[] = [];
  const timeline: string[] = [];
  const outcomes = await executeToolCallsSequentially(
    ["missing-file", "package-json"],
    async (tool) => {
      calls.push(tool);
      timeline.push("execute:" + tool);
      if (tool === "missing-file") {
        throw new Error(
          "GitHub repository or requested resource was not found. Confirm repository access and the supplied ref/path.",
        );
      }
      return { content: '{"dependencies":{"next":"15.5.28"}}' };
    },
    () => true,
    async (tool, execution) => {
      persisted.push(tool + ":" + (execution.ok ? "completed" : "failed"));
      timeline.push("persist:" + tool);
    },
  );

  assert.deepEqual(timeline, [
    "execute:missing-file",
    "persist:missing-file",
    "execute:package-json",
    "persist:package-json",
  ]);
  assert.deepEqual(calls, ["missing-file", "package-json"]);
  assert.deepEqual(persisted, ["missing-file:failed", "package-json:completed"]);
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
    assert.ok(JSON.stringify(outcomes[1].execution.result).includes("15.5.28"));
  }
});

test("keeps unknown internal exceptions sanitized", () => {
  assert.equal(
    safeAgentFailureMessage(new Error("database secret or stack details")),
    "Unexpected internal error. Check server logs using the task ID.",
  );
});

test("does not convert device-job infrastructure failures into tool errors", async () => {
  await assert.rejects(
    executeToolCallsSequentially(
      ["device-tool"],
      async () => {
        throw new Error("Device tool job could not be queued.");
      },
      (call) => call !== "device-tool",
    ),
    /Device tool job could not be queued/,
  );
});

test("stops when persisting a tool outcome fails instead of silently losing task history", async () => {
  const calls: string[] = [];
  await assert.rejects(
    executeToolCallsSequentially(
      ["first", "second"],
      async (call) => {
        calls.push(call);
        return { ok: true };
      },
      () => true,
      async () => {
        throw new Error("Unable to persist task event.");
      },
    ),
    /Unable to persist task event/,
  );
  assert.deepEqual(calls, ["first"]);
});

test("cooperative lifecycle checkpoint stops before the next tool call", async () => {
  const executed: string[] = [];
  let checks = 0;
  await assert.rejects(
    executeToolCallsSequentially(
      ["first", "second"],
      async (call) => {
        executed.push(call);
        return { ok: true };
      },
      () => true,
      undefined,
      async () => {
        checks += 1;
        if (checks === 2) throw new Error("Agent task cancellation requested.");
      },
    ),
    /cancellation requested/,
  );
  assert.deepEqual(executed, ["first"]);
  assert.equal(checks, 2);
});


test("runs independent calls with bounded concurrency and persists results in plan order", async () => {
  const calls = ["one", "two", "three", "four", "five"];
  const persisted: string[] = [];
  let active = 0;
  let maximumActive = 0;
  const outcomes = await executeToolCallsWithConcurrency(
    calls,
    async (call) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => setTimeout(resolve, call === "one" ? 5 : 0));
      active -= 1;
      return call.toUpperCase();
    },
    2,
    () => true,
    async (call) => { persisted.push(call); },
  );
  assert.equal(maximumActive, 2);
  assert.deepEqual(outcomes.map((item) => item.call), calls);
  assert.deepEqual(persisted, calls);
  assert.deepEqual(outcomes.map((item) => item.execution), calls.map((call) => ({ ok: true, result: call.toUpperCase() })));
});

test("rejects concurrency values outside the safe bound", async () => {
  await assert.rejects(executeToolCallsWithConcurrency(["one"], async () => "ok", 5), /between one and four/);
});
