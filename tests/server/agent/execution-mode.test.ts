import assert from "node:assert/strict";
import test from "node:test";
import { resolveAgentExecutionMode } from "../../../src/server/agent/execution-mode";

test("tool-backed tasks require registered tool calls regardless of planner provider", () => {
  assert.deepEqual(resolveAgentExecutionMode(1, "mock", "Count words in: one two"), {
    ok: true,
    mode: "tool_backed",
  });
});

test("model-only writing and reasoning require a real planner provider", () => {
  assert.deepEqual(resolveAgentExecutionMode(0, "openai", "Write a short welcome message"), {
    ok: true,
    mode: "model_only",
  });
  assert.equal(resolveAgentExecutionMode(0, "mock", "Write a short welcome message").ok, false);
});

test("model-only mode cannot replace source-backed research", () => {
  const result = resolveAgentExecutionMode(0, "openrouter", "Research the latest Android permission rules and cite sources");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "AGENT_SOURCE_EVIDENCE_REQUIRED");
});
