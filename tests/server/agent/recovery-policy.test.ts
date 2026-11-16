import assert from "node:assert/strict";
import test from "node:test";
import { canAttemptAgentRecovery, fingerprintAgentToolCall, selectSafeRecoveryToolCalls } from "../../../src/server/agent/recovery-policy";

test("fingerprints tool arguments independently of object key order", () => {
  assert.equal(
    fingerprintAgentToolCall({ toolId: "web.search", arguments: { query: "agent", maxResults: 5 } }),
    fingerprintAgentToolCall({ toolId: "web.search", arguments: { maxResults: 5, query: "agent" } }),
  );
});

test("recovery selects only new safe read-only calls and never replays attempted operations", () => {
  const attempted = new Set([
    fingerprintAgentToolCall({ toolId: "web.search", arguments: { query: "original", maxResults: 5 } }),
  ]);
  const calls = selectSafeRecoveryToolCalls([
    { id: "call-1", toolId: "web.search", arguments: { query: "original", maxResults: 5 } },
    { id: "call-2", toolId: "memory.store", arguments: { key: "x", content: "y" } },
    { id: "call-3", toolId: "github.read_file", arguments: { path: "README.md" } },
  ], attempted, new Set(["web.search", "github.read_file"]), 3, 1);

  assert.deepEqual(calls, [
    { id: "call-2", toolId: "github.read_file", arguments: { path: "README.md" } },
  ]);
});

test("recovery obeys the remaining global tool-call budget and eight-call ceiling", () => {
  const candidates = Array.from({ length: 8 }, (_, index) => ({
    id: "call-" + (index + 1),
    toolId: "web.search",
    arguments: { query: "query-" + index },
  }));
  const selected = selectSafeRecoveryToolCalls(candidates, new Set(), new Set(["web.search"]), 10, 6);
  assert.equal(selected.length, 2);
  assert.deepEqual(selected.map((call) => call.id), ["call-7", "call-8"]);
  assert.deepEqual(selectSafeRecoveryToolCalls(candidates, new Set(), new Set(["web.search"]), 0, 0), []);
});

test("allows at most two recovery cycles while failures and execution budgets remain", () => {
  const base = {
    maxRecoveryAttempts: 2,
    failedOperations: 1,
    pendingDeviceJobs: 0,
    remainingToolBudget: 2,
    remainingStepBudget: 3,
  };
  assert.equal(canAttemptAgentRecovery({ ...base, recoveryAttempts: 0 }), true);
  assert.equal(canAttemptAgentRecovery({ ...base, recoveryAttempts: 1 }), true);
  assert.equal(canAttemptAgentRecovery({ ...base, recoveryAttempts: 2 }), false);
});

test("blocks recovery without failures, with pending device jobs, or without budgets", () => {
  const base = {
    recoveryAttempts: 0,
    maxRecoveryAttempts: 2,
    failedOperations: 1,
    pendingDeviceJobs: 0,
    remainingToolBudget: 2,
    remainingStepBudget: 3,
  };
  assert.equal(canAttemptAgentRecovery({ ...base, failedOperations: 0 }), false);
  assert.equal(canAttemptAgentRecovery({ ...base, pendingDeviceJobs: 1 }), false);
  assert.equal(canAttemptAgentRecovery({ ...base, remainingToolBudget: 0 }), false);
  assert.equal(canAttemptAgentRecovery({ ...base, remainingStepBudget: 0 }), false);
});
