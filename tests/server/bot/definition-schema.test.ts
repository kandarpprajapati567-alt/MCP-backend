import test from "node:test";
import assert from "node:assert/strict";
import { parseBotDefinition } from "../../../src/server/bot/definition-schema";

const agentA = "11111111-1111-4111-8111-111111111111";
const agentB = "22222222-2222-4222-8222-222222222222";
const valid = {
  name: "Nova Assistant",
  description: "User-facing assistant",
  personaInstructions: "Be helpful, accurate and transparent.",
  agentIds: [agentA, agentB],
  defaultAgentId: agentA,
};

test("accepts a Bot with assigned Agents and safe defaults", () => {
  const parsed = parseBotDefinition(valid);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.providerPreference, "auto");
    assert.equal(parsed.value.enabled, true);
    assert.deepEqual(parsed.value.allowedTools, []);
  }
});

test("requires at least one assigned Agent", () => {
  assert.equal(parseBotDefinition({ ...valid, agentIds: [] }).ok, false);
});

test("default Agent must be assigned to the Bot", () => {
  assert.equal(parseBotDefinition({ ...valid, defaultAgentId: "33333333-3333-4333-8333-333333333333" }).ok, false);
});

test("rejects duplicate Agents, malformed IDs and unsafe tool IDs", () => {
  assert.equal(parseBotDefinition({ ...valid, agentIds: [agentA, agentA] }).ok, false);
  assert.equal(parseBotDefinition({ ...valid, agentIds: ["not-a-uuid"] }).ok, false);
  assert.equal(parseBotDefinition({ ...valid, allowedTools: ["../../secret"] }).ok, false);
});

test("rejects unsupported fields and invalid provider preferences", () => {
  assert.equal(parseBotDefinition({ ...valid, providerPreference: "custom" }).ok, false);
  assert.equal(parseBotDefinition({ ...valid, debug: true }).ok, false);
});
