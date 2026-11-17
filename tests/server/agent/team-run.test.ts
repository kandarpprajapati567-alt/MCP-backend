import assert from "node:assert/strict";
import test from "node:test";
import { isAgentTeamTerminal, summarizeAgentTeamMembers } from "../../../src/server/agent/team-run";

const verified = {
  status: "completed",
  completionEvaluation: { verdict: "execution_complete" },
  goalEvaluation: { verdict: "criteria_covered" },
};

test("summarizes a queued parallel team", () => {
  assert.deepEqual(summarizeAgentTeamMembers([{ status: "queued" }, { status: "queued" }]), {
    status: "queued", total: 2, completed: 0, partial: 0, needsReview: 0, failed: 0, pending: 2,
  });
});

test("summarizes active mixed worker states", () => {
  assert.deepEqual(summarizeAgentTeamMembers([{ status: "executing" }, verified]), {
    status: "running", total: 2, completed: 1, partial: 0, needsReview: 0, failed: 0, pending: 1,
  });
});

test("a database completed status with partial goal evaluation is not successful", () => {
  const summary = summarizeAgentTeamMembers([{
    status: "completed",
    completionEvaluation: { verdict: "execution_complete" },
    goalEvaluation: { verdict: "partial" },
  }]);
  assert.equal(summary.status, "partial");
  assert.equal(summary.completed, 0);
  assert.equal(summary.partial, 1);
});

test("a database completed status with missing evaluation evidence needs review", () => {
  const summary = summarizeAgentTeamMembers([{ status: "completed" }]);
  assert.equal(summary.status, "partial");
  assert.equal(summary.needsReview, 1);
  assert.equal(summary.completed, 0);
});

test("preserves partial completion when one specialist fails", () => {
  const summary = summarizeAgentTeamMembers([verified, { status: "failed" }]);
  assert.deepEqual(summary, {
    status: "partial", total: 2, completed: 1, partial: 0, needsReview: 0, failed: 1, pending: 0,
  });
});

test("marks a fully successful team complete only when both evaluations pass", () => {
  assert.equal(summarizeAgentTeamMembers([verified, verified]).status, "completed");
});

test("marks zero-evidence needs-review tasks as non-successful", () => {
  const summary = summarizeAgentTeamMembers([{
    status: "needs_review",
    completionEvaluation: { verdict: "needs_review" },
    goalEvaluation: { verdict: "criteria_covered" },
  }]);
  assert.equal(summary.status, "partial");
  assert.equal(summary.needsReview, 1);
  assert.equal(summary.completed, 0);
});

test("team terminal states include evaluated outcomes", () => {
  assert.equal(isAgentTeamTerminal("partial"), true);
  assert.equal(isAgentTeamTerminal("needs_review"), true);
  assert.equal(isAgentTeamTerminal("running"), false);
});

test("marks a team failed when every specialist task fails", () => {
  assert.deepEqual(summarizeAgentTeamMembers([{ status: "failed" }, { status: "cancelled" }]), {
    status: "failed", total: 2, completed: 0, partial: 0, needsReview: 0, failed: 2, pending: 0,
  });
});
