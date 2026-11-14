import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentTaskBudgetExceededError,
  assertAgentTaskPlanWithinBudget,
  assertAgentTaskTimeBudget,
  assertAgentTaskToolResultWithinBudget,
  getAgentTaskJsonByteLength,
  resolveAgentTaskBudget,
} from "../../../src/server/agent/task-budget";

test("default task budget is zero-cost and bounded", () => {
  assert.deepEqual(resolveAgentTaskBudget(), {
    maxSteps: 8, maxToolCalls: 4, maxExecutionMs: 180_000,
    maxToolResultBytes: 16_384, maxTotalToolResultBytes: 49_152, maxSynthesisTokens: 1_800,
  });
});

test("configured Agent limits remain inside the hard schema ceiling", () => {
  assert.equal(resolveAgentTaskBudget({ maxSteps: 16, maxToolCalls: 8 }).maxToolCalls, 8);
  assert.throws(() => resolveAgentTaskBudget({ maxSteps: 17, maxToolCalls: 8 }));
  assert.throws(() => resolveAgentTaskBudget({ maxSteps: 8, maxToolCalls: 9 }));
});

test("plan step and tool-call counts are enforced before execution", () => {
  const budget = resolveAgentTaskBudget();
  assert.doesNotThrow(() => assertAgentTaskPlanWithinBudget({ steps: Array(8).fill({}), toolCalls: Array(4).fill({}) }, budget));
  assert.throws(() => assertAgentTaskPlanWithinBudget({ steps: Array(9).fill({}), toolCalls: [] }, budget), AgentTaskBudgetExceededError);
  assert.throws(() => assertAgentTaskPlanWithinBudget({ steps: [{}], toolCalls: Array(5).fill({}) }, budget), AgentTaskBudgetExceededError);
});

test("JSON output sizes use UTF-8 byte counts", () => {
  assert.equal(getAgentTaskJsonByteLength("é"), Buffer.byteLength('"é"', "utf8"));
});

test("single and aggregate tool output limits fail closed", () => {
  const budget = resolveAgentTaskBudget();
  assert.doesNotThrow(() => assertAgentTaskToolResultWithinBudget(100, 100, budget));
  assert.throws(() => assertAgentTaskToolResultWithinBudget(16_385, 0, budget), AgentTaskBudgetExceededError);
  assert.throws(() => assertAgentTaskToolResultWithinBudget(10, 49_150, budget), AgentTaskBudgetExceededError);
});

test("active execution deadline is enforced", () => {
  const budget = resolveAgentTaskBudget();
  assert.doesNotThrow(() => assertAgentTaskTimeBudget(1_000, 180_000, budget));
  assert.throws(() => assertAgentTaskTimeBudget(1_000, 181_001, budget), AgentTaskBudgetExceededError);
});
