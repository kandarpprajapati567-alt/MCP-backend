import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAgentGoalCriteria } from "../../../src/server/agent/goal-evaluator";

const plan = {
  version: 1 as const, goal: "Count the words",
  steps: [{ id: "step-count", objective: "Count words in the supplied text", expectedOutcome: "The word count result is 4" }],
  toolCalls: [{ id: "call-count", toolId: "text.word_count", arguments: { text: "alpha beta gamma delta" } }],
};

test("covers planned outcome terms present in observed evidence", () => {
  const report = evaluateAgentGoalCriteria(plan, [{ callId: "call-count", toolId: "text.word_count", result: { count: 4 } }], "The word count result is 4 [ev-call-count].");
  assert.equal(report.verdict, "criteria_covered");
  assert.equal(report.coveredCriteria, 1);
  assert.deepEqual(report.criteria[0].missingTerms, []);
  assert.equal(report.semanticGoalVerification, "not_performed");
});

test("marks outcome partial when expected evidence is absent", () => {
  const report = evaluateAgentGoalCriteria(plan, [], "No tool result was produced.");
  assert.equal(report.verdict, "partial");
  assert.ok(report.criteria[0].missingTerms.includes("4"));
});

test("requires review when plan outcomes have no measurable terms", () => {
  const vague = { ...plan, steps: [{ id: "step-vague", objective: "Do the task", expectedOutcome: "The task is complete" }] };
  const report = evaluateAgentGoalCriteria(vague, [], "Done.");
  assert.equal(report.verdict, "needs_review");
  assert.equal(report.unverifiableCriteria, 1);
});

test("failed tool output cannot count as goal evidence", () => {
  const report = evaluateAgentGoalCriteria(plan, [{ callId: "call-count", toolId: "text.word_count", result: { ok: false, error: "count 4 unavailable" } }], "No result was produced.");
  assert.equal(report.verdict, "partial");
  assert.ok(report.criteria[0].missingTerms.includes("4"));
});

test("flags contradictory structured tool values even when synthesis repeats the expected value", () => {
  const report = evaluateAgentGoalCriteria(plan, [{ callId: "call-count", toolId: "text.word_count", result: { count: 2 } }], "The word count result is 4 [ev-call-count].");
  assert.equal(report.verdict, "needs_review");
  assert.equal(report.contradictoryCriteria, 1);
  assert.equal(report.criteria[0].status, "contradictory");
  assert.match(report.criteria[0].contradictions[0], /count=2/);
});

test("does not treat unrelated numeric fields as a contradiction", () => {
  const report = evaluateAgentGoalCriteria(plan, [{ callId: "call-count", toolId: "text.word_count", result: { count: 4, durationMs: 18 } }], "The word count result is 4 [ev-call-count].");
  assert.equal(report.verdict, "criteria_covered");
  assert.equal(report.contradictoryCriteria, 0);
});


test("covers deterministic text-tool outcomes by their returned field names", () => {
  const cases = [
    { toolId: "text.word_count", expectedOutcome: "wordCount", result: { wordCount: 4 } },
    { toolId: "text.extract_keywords", expectedOutcome: "keywords", result: { keywords: [{ keyword: "solar", count: 2 }] } },
    { toolId: "text.text_stats", expectedOutcome: "characters words sentences", result: { characters: 71, words: 10, sentences: 2 } },
  ];
  for (const item of cases) {
    const generatedPlan = { ...plan, steps: [{ id: "step-1", objective: "Run " + item.toolId, expectedOutcome: item.expectedOutcome }], toolCalls: [{ id: "call-1", toolId: item.toolId, arguments: { text: "sample" } }] };
    const report = evaluateAgentGoalCriteria(generatedPlan, [{ callId: "call-1", toolId: item.toolId, result: item.result }], "Raw deterministic result [ev-call-1].");
    assert.equal(report.verdict, "criteria_covered", item.toolId);
  }
});
