import assert from "node:assert/strict";
import test from "node:test";
import { parseAgentTeamRequest } from "../../../src/server/agent/team-schema";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const third = "33333333-3333-4333-8333-333333333333";

test("accepts a bounded team with different delegated objectives", () => {
  assert.deepEqual(parseAgentTeamRequest({ members: [
    { agentId: first, task: "  Research the topic  " },
    { agentId: second, task: "Evaluate risks and counterarguments" },
  ] }), {
    ok: true,
    value: { members: [
      { agentId: first, task: "Research the topic" },
      { agentId: second, task: "Evaluate risks and counterarguments" },
    ] },
  });
});

test("rejects fewer than two or more than three assignments", () => {
  assert.equal(parseAgentTeamRequest({ members: [{ agentId: first, task: "Task" }] }).ok, false);
  assert.equal(parseAgentTeamRequest({ members: [
    { agentId: first, task: "A" }, { agentId: second, task: "B" },
    { agentId: third, task: "C" }, { agentId: "44444444-4444-4444-8444-444444444444", task: "D" },
  ] }).ok, false);
});

test("rejects duplicate and malformed Agent IDs", () => {
  assert.equal(parseAgentTeamRequest({ members: [
    { agentId: first, task: "A" }, { agentId: first, task: "B" },
  ] }).ok, false);
  assert.equal(parseAgentTeamRequest({ members: [
    { agentId: first, task: "A" }, { agentId: "not-a-uuid", task: "B" },
  ] }).ok, false);
});

test("rejects blank, oversized and unsupported assignments", () => {
  assert.equal(parseAgentTeamRequest({ members: [
    { agentId: first, task: " " }, { agentId: second, task: "B" },
  ] }).ok, false);
  assert.equal(parseAgentTeamRequest({ members: [
    { agentId: first, task: "x".repeat(4001) }, { agentId: second, task: "B" },
  ] }).ok, false);
  assert.equal(parseAgentTeamRequest({ members: [
    { agentId: first, task: "A", unsafe: true }, { agentId: second, task: "B" },
  ] }).ok, false);
});
