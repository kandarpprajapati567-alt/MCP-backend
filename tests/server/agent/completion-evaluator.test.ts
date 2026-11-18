import assert from "node:assert/strict";
import test from "node:test";
import { canMarkAgentTaskCompleted, evaluateAgentCompletion } from "../../../src/server/agent/completion-evaluator";

const plan = {
  version: 1 as const,
  goal: "Collect and summarize evidence",
  steps: [{ id: "step-1", objective: "Search", expectedOutcome: "Evidence returned" }],
  toolCalls: [{ id: "call-1", toolId: "web.search", arguments: { query: "test" } }],
};

test("marks fully observed successful calls with matching citations as execution complete", () => {
  const report = evaluateAgentCompletion(plan, [
    { callId: "call-1", toolId: "web.search", result: { title: "Observed", url: "https://example.org" } },
  ], "Observed source [ev-call-1]: https://example.org");
  assert.equal(report.verdict, "execution_complete");
  assert.deepEqual(report.missingToolCallIds, []);
  assert.deepEqual(report.failedToolCallIds, []);
  assert.equal(report.independentGoalVerification, "not_performed");
});

test("reports missing planned tool output as partial", () => {
  const report = evaluateAgentCompletion(plan, [], "No evidence");
  assert.equal(report.verdict, "partial");
  assert.deepEqual(report.missingToolCallIds, ["call-1"]);
});

test("reports failed operations as partial even if a result object exists", () => {
  const report = evaluateAgentCompletion(plan, [
    { callId: "call-1", toolId: "web.search", result: { ok: false, error: "offline" } },
  ], "The search completed.");
  assert.equal(report.verdict, "partial");
  assert.deepEqual(report.failedToolCallIds, ["call-1"]);
});

test("does not claim goal verification for tasks with no tool calls", () => {
  const noTools = { ...plan, toolCalls: [] };
  const report = evaluateAgentCompletion(noTools, [], "Here is a general answer.");
  assert.equal(report.verdict, "needs_review");
  assert.equal(report.independentGoalVerification, "not_performed");
});

test("requires evidence citations before declaring execution complete", () => {
  const report = evaluateAgentCompletion(plan, [
    { callId: "call-1", toolId: "web.search", result: { title: "Observed" } },
  ], "A factual answer without a citation.");
  assert.equal(report.verdict, "needs_review");
  assert.ok(report.reasons.some((reason) => reason.includes("No supplied evidence ID was cited")));
});

test("only verified goal coverage with observed evidence can mark a task completed", () => {
  assert.equal(canMarkAgentTaskCompleted("execution_complete", "criteria_covered", 1), true);
  assert.equal(canMarkAgentTaskCompleted("partial", "criteria_covered", 1), false);
  assert.equal(canMarkAgentTaskCompleted("needs_review", "criteria_covered", 1), false);
  assert.equal(canMarkAgentTaskCompleted("execution_complete", "partial", 1), false);
  assert.equal(canMarkAgentTaskCompleted("execution_complete", "needs_review", 1), false);
  assert.equal(canMarkAgentTaskCompleted("execution_complete", "criteria_covered", 0), false);
});
