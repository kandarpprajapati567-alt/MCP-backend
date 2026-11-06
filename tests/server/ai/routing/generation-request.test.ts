import assert from "node:assert/strict";
import test from "node:test";

import { parseAIGenerationInput } from "../../../../src/server/ai/routing/generation-request";

const valid = {
  workflow: "planner",
  messages: [{ role: "user", content: "Plan this task." }],
};

test("accepts a valid generation request and preserves optional settings", () => {
  const result = parseAIGenerationInput({ ...valid, temperature: 0.7, maxOutputTokens: 500 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.workflow, "planner");
    assert.equal(result.value.messages[0]?.content, "Plan this task.");
    assert.equal(result.value.temperature, 0.7);
    assert.equal(result.value.maxOutputTokens, 500);
  }
});

test("rejects non-object bodies and unsupported workflows", () => {
  assert.equal(parseAIGenerationInput(null).ok, false);
  assert.equal(parseAIGenerationInput([]).ok, false);
  assert.equal(parseAIGenerationInput({ ...valid, workflow: "custom-url" }).ok, false);
});

test("rejects empty, oversized, and malformed message arrays", () => {
  assert.equal(parseAIGenerationInput({ ...valid, messages: [] }).ok, false);
  assert.equal(parseAIGenerationInput({ ...valid, messages: Array(21).fill(valid.messages[0]) }).ok, false);
  assert.equal(parseAIGenerationInput({ ...valid, messages: [null] }).ok, false);
  assert.equal(parseAIGenerationInput({ ...valid, messages: [{ role: "tool", content: "x" }] }).ok, false);
  assert.equal(parseAIGenerationInput({ ...valid, messages: [{ role: "user", content: "x".repeat(4001) }] }).ok, false);
});

test("rejects aggregate message content above the request limit", () => {
  const result = parseAIGenerationInput({
    workflow: "research",
    messages: [{ role: "user", content: "x".repeat(4000) }, { role: "assistant", content: "y".repeat(4000) }, { role: "user", content: "z".repeat(4001) }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 413);
});

test("validates temperature as a finite number from zero through two", () => {
  for (const temperature of [-0.1, 2.1, Number.NaN, "1"]) {
    assert.equal(parseAIGenerationInput({ ...valid, temperature }).ok, false);
  }
  assert.equal(parseAIGenerationInput({ ...valid, temperature: 0 }).ok, true);
  assert.equal(parseAIGenerationInput({ ...valid, temperature: 2 }).ok, true);
});

test("validates maxOutputTokens as an integer from 1 through 2000", () => {
  for (const maxOutputTokens of [0, -1, 2001, 1.5, "100", null]) {
    assert.equal(parseAIGenerationInput({ ...valid, maxOutputTokens }).ok, false);
  }
  assert.equal(parseAIGenerationInput({ ...valid, maxOutputTokens: 1 }).ok, true);
  assert.equal(parseAIGenerationInput({ ...valid, maxOutputTokens: 2000 }).ok, true);
});

test("does not copy client-supplied provider or endpoint fields into the parsed request", () => {
  const result = parseAIGenerationInput({
    ...valid,
    provider: "attacker-controlled",
    model: "attacker-model",
    baseURL: "https://attacker.example",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal("provider" in result.value, false);
    assert.equal("model" in result.value, false);
    assert.equal("baseURL" in result.value, false);
  }
});
