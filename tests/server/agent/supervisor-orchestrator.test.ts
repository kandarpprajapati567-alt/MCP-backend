import assert from "node:assert/strict";
import test from "node:test";
import {
  assignSubtasksToAgents,
  buildFallbackSupervisorPlan,
  parseSupervisorPlan,
  runStageTwoDiagnostics,
} from "../../../src/server/agent/supervisor-orchestrator";

const agents = [
  { id: "research", name: "Research Agent", description: "Web research", role: "Research analyst", allowedTools: ["web.search"], enabled: true },
  { id: "developer", name: "Developer Agent", description: "Repository coding", role: "Software engineer", allowedTools: ["github.read_file"], enabled: true },
  { id: "disabled", name: "Disabled Agent", description: "Research", role: "Research analyst", allowedTools: ["web.search"], enabled: false },
];

test("fallback planner splits explicit independent workstreams within the three-task limit", () => {
  const plan = buildFallbackSupervisorPlan("Research official docs; Analyze the risks; Write the report");
  assert.equal(plan.subtasks.length, 3);
  assert.match(plan.subtasks[1].objective, /Analyze/);
});

test("fallback planner separates clear action clauses joined by and", () => {
  const plan = buildFallbackSupervisorPlan("Research official docs and analyze the risks and write a report");
  assert.equal(plan.subtasks.length, 3);
  assert.match(plan.subtasks[0].objective, /Research/);
  assert.match(plan.subtasks[1].objective, /analyze/i);
  assert.match(plan.subtasks[2].objective, /write/i);
});

test("supervisor schema rejects unsupported capability labels", () => {
  const result = parseSupervisorPlan({
    goal: "Test", summary: "Plan", subtasks: [{ id: "one", title: "One", objective: "Do work", requiredCapabilities: ["root"] }],
  }, "Test");
  assert.equal(result.ok, false);
});

test("capability assignment routes research and coding to matching specialists", () => {
  const plan = buildFallbackSupervisorPlan("Research sources; Implement code in repository");
  const result = assignSubtasksToAgents(plan.subtasks, agents);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.assignments[0].agentId, "research");
    assert.equal(result.assignments[1].agentId, "developer");
  }
});

test("specialized tasks are not dispatched to an unrelated Agent", () => {
  const genericOnly = [{ id: "general", name: "General Agent", description: "General assistant", role: "Assistant", allowedTools: [], enabled: true }];
  const result = assignSubtasksToAgents([
    { id: "code", title: "Fix code", objective: "Fix and refactor repository code", requiredCapabilities: ["coding", "github"] },
  ], genericOnly);
  assert.equal(result.ok, false);
});

test("disabled agents are excluded and no-enabled-agent state is explicit", () => {
  const result = assignSubtasksToAgents([{ id: "one", title: "Research", objective: "Research", requiredCapabilities: ["research"] }], agents);
  assert.equal(result.ok, true);
  if (result.ok) assert.ok(result.assignments.every((item) => item.agentId !== "disabled"));
  assert.equal(assignSubtasksToAgents([{ id: "one", title: "Work", objective: "Work", requiredCapabilities: ["general"] }], agents.map((agent) => ({ ...agent, enabled: false }))).ok, false);
});


test("planner preserves overflow work instead of silently dropping objectives", () => {
  const plan = buildFallbackSupervisorPlan("Research sources; Analyze risks; Write report; Verify citations");
  assert.equal(plan.subtasks.length, 3);
  assert.match(plan.subtasks[2].objective, /Write report/);
  assert.match(plan.subtasks[2].objective, /Verify citations/);
});

test("specialist assignment ignores generic keyword overlap and reuses a qualified Agent", () => {
  const candidates = [
    { id: "general", name: "General Helper", description: "Repository support assistant", role: "General assistant", allowedTools: [], enabled: true },
    { id: "developer", name: "Developer", description: "Software engineering", role: "Developer", allowedTools: ["github.read_file"], enabled: true },
  ];
  const result = assignSubtasksToAgents([
    { id: "one", title: "Fix", objective: "Fix and refactor repository code", requiredCapabilities: ["coding", "github"] },
    { id: "two", title: "Review", objective: "Review repository implementation", requiredCapabilities: ["coding", "github"] },
  ], candidates);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.assignments.map((item) => item.agentId), ["developer", "developer"]);
});

test("Stage 2 self-test reports every diagnostic check as passed", () => {
  const results = runStageTwoDiagnostics();
  assert.equal(results.length, 5);
  assert.ok(results.every((item) => item.status === "passed"));
});
