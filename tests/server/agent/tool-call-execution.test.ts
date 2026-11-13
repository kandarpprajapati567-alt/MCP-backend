import assert from "node:assert/strict";
import test from "node:test";
import {
  executeToolCallsSequentially,
  executeToolCallsWithBoundedParallelism,
} from "../../../src/server/agent/tool-call-execution";
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


test("runs explicitly read-only calls concurrently but keeps side effects serial", async () => {
  const active = new Set<string>();
  let maxActive = 0;
  const timeline: string[] = [];
  const persisted: string[] = [];
  const outcomes = await executeToolCallsWithBoundedParallelism(
    ["read-1", "read-2", "write", "read-3", "read-4"],
    async (call) => {
      timeline.push("start:" + call);
      active.add(call);
      maxActive = Math.max(maxActive, active.size);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active.delete(call);
      timeline.push("end:" + call);
      return { call };
    },
    {
      maxConcurrency: 2,
      canRunInParallel: (call) => call.startsWith("read-"),
      onOutcome: async (call, execution) => {
        persisted.push(call + ":" + (execution.ok ? "completed" : "failed"));
      },
    },
  );

  assert.equal(maxActive, 2);
  assert.equal(outcomes.length, 5);
  assert.deepEqual(persisted, [
    "read-1:completed",
    "read-2:completed",
    "write:completed",
    "read-3:completed",
    "read-4:completed",
  ]);
  assert.ok(timeline.indexOf("end:read-1") < timeline.indexOf("start:write"));
  assert.ok(timeline.indexOf("end:read-2") < timeline.indexOf("start:write"));
  assert.ok(timeline.indexOf("end:write") < timeline.indexOf("start:read-3"));
});

test("persists parallel outcomes in plan order even when completion order differs", async () => {
  const persisted: string[] = [];
  await executeToolCallsWithBoundedParallelism(
    ["slow", "fast"],
    async (call) => {
      await new Promise((resolve) => setTimeout(resolve, call === "slow" ? 20 : 1));
      return call;
    },
    {
      canRunInParallel: () => true,
      onOutcome: async (call) => { persisted.push(call); },
    },
  );
  assert.deepEqual(persisted, ["slow", "fast"]);
});

test("checks cancellation for the full read-only batch before launching any call", async () => {
  const executed: string[] = [];
  let checks = 0;
  await assert.rejects(
    executeToolCallsWithBoundedParallelism(
      ["first", "second"],
      async (call) => { executed.push(call); return call; },
      {
        canRunInParallel: () => true,
        beforeEach: async () => {
          checks += 1;
          if (checks === 2) throw new Error("Agent task cancellation requested.");
        },
      },
    ),
    /cancellation requested/,
  );
  assert.equal(checks, 2);
  assert.deepEqual(executed, []);
});

test("propagates infrastructure failures after persisting earlier ordered outcomes", async () => {
  const persisted: string[] = [];
  await assert.rejects(
    executeToolCallsWithBoundedParallelism(
      ["first", "fatal"],
      async (call) => {
        if (call === "fatal") throw new Error("database unavailable");
        return call;
      },
      {
        canRunInParallel: () => true,
        shouldCaptureFailure: (call) => call !== "fatal",
        onOutcome: async (call) => { persisted.push(call); },
      },
    ),
    /database unavailable/,
  );
  assert.deepEqual(persisted, ["first"]);
});

test("rejects unsafe concurrency limits", async () => {
  await assert.rejects(
    executeToolCallsWithBoundedParallelism(
      ["one"],
      async (call) => call,
      { maxConcurrency: 5, canRunInParallel: () => true },
    ),
    /between 1 and 4/,
  );
});
