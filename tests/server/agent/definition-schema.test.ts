import test from "node:test";
import assert from "node:assert/strict";
import { parseAgentDefinition } from "../../../src/server/agent/definition-schema";

const valid = {
  name: "Research Agent",
  description: "Researches a topic",
  role: "Research specialist",
  instructions: "Use trusted sources and report evidence.",
};

test("accepts a valid agent definition with safe defaults", () => {
  const parsed = parseAgentDefinition(valid);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.providerPreference, "auto");
    assert.equal(parsed.value.enabled, true);
    assert.deepEqual(parsed.value.allowedTools, []);
  }
});

test("rejects missing required instructions", () => {
  assert.equal(parseAgentDefinition({ ...valid, instructions: " " }).ok, false);
});

test("rejects unsupported providers and unsafe tool IDs", () => {
  assert.equal(parseAgentDefinition({ ...valid, providerPreference: "custom" }).ok, false);
  assert.equal(parseAgentDefinition({ ...valid, allowedTools: ["../../secret"] }).ok, false);
});

test("enforces execution limits and duplicate tool rejection", () => {
  assert.equal(parseAgentDefinition({ ...valid, maxSteps: 9 }).ok, false);
  assert.equal(parseAgentDefinition({ ...valid, maxToolCalls: -1 }).ok, false);
  assert.equal(parseAgentDefinition({ ...valid, allowedTools: ["text.word_count", "text.word_count"] }).ok, false);
});

test("rejects unknown fields instead of silently ignoring misspelled policy", () => {
  assert.deepEqual(parseAgentDefinition({ ...valid, maxToolCall: 0 }), {
    ok: false,
    error: "Agent definition contains unsupported fields.",
  });
});

test("accepts the expanded but bounded Agent execution capacity", () => {
  const parsed = parseAgentDefinition({ ...valid, maxSteps: 16, maxToolCalls: 8 });
  assert.equal(parsed.ok, true);
  assert.equal(parseAgentDefinition({ ...valid, maxSteps: 17 }).ok, false);
  assert.equal(parseAgentDefinition({ ...valid, maxToolCalls: 9 }).ok, false);
});
