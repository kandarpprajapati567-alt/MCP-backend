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
  assert.deepEqual(summarizeAgentTeamMembers([
    { status: "completed", completionVerdict: "execution_complete", goalVerdict: "criteria_covered", evidenceCount: 1 },
    { status: "failed" },
  ]), {
    status: "partial", total: 2, completed: 1, partial: 0, needsReview: 0, failed: 1, pending: 0,
  });
});

test("marks a fully successful team complete", () => {
  assert.equal(summarizeAgentTeamMembers([
    { status: "completed", completionVerdict: "execution_complete", goalVerdict: "criteria_covered", evidenceCount: 2 },
    { status: "completed", completionVerdict: "execution_complete", goalVerdict: "criteria_covered", evidenceCount: 1 },
  ]).status, "completed");
});

test("team terminal states are explicit", () => {
  assert.equal(isAgentTeamTerminal("partial"), true);
  assert.equal(isAgentTeamTerminal("running"), false);
});

test("marks a team failed when every specialist task fails", () => {
  assert.deepEqual(summarizeAgentTeamMembers([{ status: "failed" }, { status: "cancelled" }]), {
    status: "failed", total: 2, completed: 0, partial: 0, needsReview: 0, failed: 2, pending: 0,
  });
});

test("a database-completed child with partial goal evidence cannot complete the team", () => {
  const summary = summarizeAgentTeamMembers([
    { status: "completed", completionVerdict: "execution_complete", goalVerdict: "partial", evidenceCount: 1 },
  ]);
  assert.equal(summary.status, "partial");
  assert.equal(summary.completed, 0);
  assert.equal(summary.partial, 1);
});

test("a child with needs-review evaluation or zero evidence leaves the team in needs_review", () => {
  const noEvidence = summarizeAgentTeamMembers([
    { status: "completed", completionVerdict: "needs_review", goalVerdict: "criteria_covered", evidenceCount: 0 },
  ]);
  assert.equal(noEvidence.status, "needs_review");
  assert.equal(noEvidence.needsReview, 1);

  const missingEvaluation = summarizeAgentTeamMembers([{ status: "completed", evidenceCount: 0 }]);
  assert.equal(missingEvaluation.status, "needs_review");
});

test("team remains running while a child is not terminal", () => {
  assert.equal(summarizeAgentTeamMembers([
    { status: "completed", completionVerdict: "execution_complete", goalVerdict: "criteria_covered", evidenceCount: 1 },
    { status: "queued" },
  ]).status, "running");
});
