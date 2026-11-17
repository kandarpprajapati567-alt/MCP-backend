import assert from "node:assert/strict";
import test from "node:test";
import { deriveAgentTaskOutcomeStatus, evaluateAgentCompletion } from "../../../src/server/agent/completion-evaluator";

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

test("maps successful execution and covered goal criteria to completed", () => {
  const completion = evaluateAgentCompletion(plan, [
    { callId: "call-1", toolId: "web.search", result: { title: "Observed", url: "https://example.org" } },
  ], "Observed source [ev-call-1]: https://example.org");
  const goal = { verdict: "criteria_covered" } as const;
  assert.equal(deriveAgentTaskOutcomeStatus(completion, goal), "completed");
});

test("maps missing tool evidence to partial rather than completed", () => {
  const completion = evaluateAgentCompletion(plan, [], "No evidence");
  const goal = { verdict: "partial" } as const;
  assert.equal(deriveAgentTaskOutcomeStatus(completion, goal), "partial");
});

test("maps zero-tool execution to needs_review rather than completed", () => {
  const noTools = { ...plan, toolCalls: [] };
  const completion = evaluateAgentCompletion(noTools, [], "General answer");
  const goal = { verdict: "criteria_covered" } as const;
  assert.equal(deriveAgentTaskOutcomeStatus(completion, goal), "needs_review");
});
