import assert from "node:assert/strict";
import test from "node:test";
import {
  assignSubtasksToAgents,
  buildFallbackSupervisorPlan,
  isExplicitFreePlannerModel,
  parseSupervisorPlan,
  runStageTwoDiagnostics,
} from "../../../src/server/agent/supervisor-orchestrator";

const agents = [
  { id: "research", name: "Research Agent", description: "Web research", role: "Research analyst", allowedTools: ["web.search"], enabled: true },
  { id: "developer", name: "Developer Agent", description: "Repository coding", role: "Software engineer", allowedTools: ["github.read_file"], enabled: true },
  { id: "disabled", name: "Disabled Agent", description: "Research", role: "Research analyst", allowedTools: ["web.search"], enabled: false },
];

test("Supervisor AI planning is allowed only for explicit OpenRouter free model IDs", () => {
  assert.equal(isExplicitFreePlannerModel("openrouter", "meta-llama/llama-3.3-70b-instruct:free"), true);
  assert.equal(isExplicitFreePlannerModel("openai", "gpt-4o-mini:free"), false);
  assert.equal(isExplicitFreePlannerModel("openrouter", "openai/gpt-4o-mini"), false);
  assert.equal(isExplicitFreePlannerModel("openrouter", "openai/gpt-4o-mini:free extra"), false);
});

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

test("research routes to connected search while read-only GitHub cannot qualify for coding", () => {
  const research = assignSubtasksToAgents([
    { id: "research", title: "Research", objective: "Research official sources", requiredCapabilities: ["research", "web"] },
  ], agents);
  assert.equal(research.ok, true);
  if (research.ok) assert.equal(research.assignments[0].agentId, "research");

  const coding = assignSubtasksToAgents([
    { id: "coding", title: "Implement", objective: "Implement repository changes", requiredCapabilities: ["coding", "github"] },
  ], agents);
  assert.equal(coding.ok, false);
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

test("read-only repository tools and profile keyword overlap never qualify for coding", () => {
  const candidates = [
    { id: "general", name: "General Helper", description: "Repository support assistant", role: "General assistant", allowedTools: [], enabled: true },
    { id: "developer", name: "Developer", description: "Software engineering", role: "Developer", allowedTools: ["github.read_file"], enabled: true },
  ];
  const result = assignSubtasksToAgents([
    { id: "one", title: "Fix", objective: "Fix and refactor repository code", requiredCapabilities: ["coding", "github"] },
  ], candidates);
  assert.equal(result.ok, false);
});

test("Stage 2 self-test reports every diagnostic check as passed", () => {
  const results = runStageTwoDiagnostics();
  assert.equal(results.length, 11);
  assert.ok(results.every((item) => item.status === "passed"));
  assert.ok(results.some((item) => item.id === "completion_evaluator_success"));
  assert.ok(results.some((item) => item.id === "completion_evaluator_missing_output"));
  assert.ok(results.some((item) => item.id === "goal_criteria_covered"));
  assert.ok(results.some((item) => item.id === "goal_criteria_missing"));
  assert.ok(results.some((item) => item.id === "goal_criteria_contradiction"));
});

test("specialist role labels cannot substitute for missing registered tool capabilities", () => {
  const roleOnly = [
    { id: "research", name: "Research Specialist", description: "Expert web researcher", role: "Research analyst", allowedTools: [], enabled: true },
    { id: "developer", name: "Developer Specialist", description: "Expert software engineer", role: "Developer", allowedTools: [], enabled: true },
  ];
  const result = assignSubtasksToAgents([
    { id: "research-task", title: "Research", objective: "Research current sources", requiredCapabilities: ["research", "web"] },
    { id: "coding-task", title: "Implement", objective: "Implement repository changes", requiredCapabilities: ["coding", "github"] },
  ], roleOnly);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /No enabled Agent matches/);
});

test("a specialist with a real matching tool manifest remains eligible even when its profile is generic", () => {
  const manifestOnly = [
    { id: "agent-a", name: "Agent A", description: "General purpose", role: "Assistant", allowedTools: ["web.search"], enabled: true },
  ];
  const result = assignSubtasksToAgents([
    { id: "research-task", title: "Research", objective: "Find sources", requiredCapabilities: ["research", "web"] },
  ], manifestOnly);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.assignments[0].agentId, "agent-a");
});

test("unavailable research integrations cannot satisfy research capability", () => {
  const disconnected = [{
    id: "research", name: "Research Agent", description: "Web research", role: "Research analyst",
    allowedTools: [], enabled: true,
  }];
  const result = assignSubtasksToAgents([
    { id: "research-task", title: "Research", objective: "Research current sources", requiredCapabilities: ["research", "web"] },
  ], disconnected);
  assert.equal(result.ok, false);
});

test("a registered repository content-write tool can satisfy coding capability", () => {
  const writer = [{
    id: "writer", name: "Repository Writer", description: "Repository implementation", role: "Engineer",
    allowedTools: ["github.read_file", "github.update_file"], enabled: true,
  }];
  const result = assignSubtasksToAgents([
    { id: "coding-task", title: "Implement", objective: "Implement repository changes", requiredCapabilities: ["coding", "github"] },
  ], writer);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.assignments[0].agentId, "writer");
});

 
test("deterministic text-analysis workstreams require an Agent with text tools", () => {
  const candidates = [
    { id: "general", name: "General Agent", description: "General assistant", role: "Assistant", allowedTools: [], enabled: true },
    { id: "text", name: "Free Test Agent", description: "Deterministic text analysis", role: "Text analyst", allowedTools: ["text.word_count", "text.extract_keywords", "text.text_stats"], enabled: true },
  ];
  const result = assignSubtasksToAgents([
    { id: "word-count", title: "Count words", objective: "Count the number of words in alpha beta gamma delta", requiredCapabilities: ["analysis"] },
  ], candidates);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.assignments[0].agentId, "text");
});
