import assert from "node:assert/strict";
import test from "node:test";
import { isAgentTeamTerminal, summarizeAgentTeamMembers } from "../../../src/server/agent/team-run";

test("summarizes a queued parallel team", () => {
  assert.deepEqual(summarizeAgentTeamMembers([{ status: "queued" }, { status: "queued" }]), {
    status: "queued", total: 2, completed: 0, failed: 0, pending: 2,
  });
});

test("summarizes active mixed worker states", () => {
  assert.deepEqual(summarizeAgentTeamMembers([{ status: "executing" }, { status: "completed" }]), {
    status: "running", total: 2, completed: 1, failed: 0, pending: 1,
  });
});

test("preserves partial completion when one specialist fails", () => {
  assert.deepEqual(summarizeAgentTeamMembers([{ status: "completed" }, { status: "failed" }]), {
    status: "partial", total: 2, completed: 1, failed: 1, pending: 0,
  });
});

test("marks a fully successful team complete", () => {
  assert.equal(summarizeAgentTeamMembers([{ status: "completed" }, { status: "completed" }]).status, "completed");
});

test("team terminal states are explicit", () => {
  assert.equal(isAgentTeamTerminal("partial"), true);
  assert.equal(isAgentTeamTerminal("running"), false);
});
