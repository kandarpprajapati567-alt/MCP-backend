import assert from "node:assert/strict";
import test from "node:test";
import { parseAgentTeamRequest } from "../../../src/server/agent/team-schema";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const third = "33333333-3333-4333-8333-333333333333";

test("accepts a bounded team of distinct specialist agents", () => {
  assert.deepEqual(parseAgentTeamRequest({ task: "  Research the topic  ", agentIds: [first, second] }), {
    ok: true,
    value: { task: "Research the topic", agentIds: [first, second] },
  });
});

test("rejects fewer than two or more than three agents", () => {
  assert.equal(parseAgentTeamRequest({ task: "Task", agentIds: [first] }).ok, false);
  assert.equal(parseAgentTeamRequest({ task: "Task", agentIds: [first, second, third, first] }).ok, false);
});

test("rejects duplicate and malformed Agent IDs", () => {
  assert.equal(parseAgentTeamRequest({ task: "Task", agentIds: [first, first] }).ok, false);
  assert.equal(parseAgentTeamRequest({ task: "Task", agentIds: [first, "not-a-uuid"] }).ok, false);
});

test("rejects blank, oversized and unsupported team requests", () => {
  assert.equal(parseAgentTeamRequest({ task: " ", agentIds: [first, second] }).ok, false);
  assert.equal(parseAgentTeamRequest({ task: "x".repeat(4001), agentIds: [first, second] }).ok, false);
  assert.equal(parseAgentTeamRequest({ task: "Task", agentIds: [first, second], unsafe: true }).ok, false);
});
