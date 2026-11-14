export type SupervisorSubtask = {
  id: string;
  title: string;
  objective: string;
  requiredCapabilities: string[];
};

export type SupervisorPlan = {
  goal: string;
  summary: string;
  subtasks: SupervisorSubtask[];
};

export type SupervisorPlanResult =
  | { ok: true; value: SupervisorPlan; planner: "configured-ai" | "safe-local-fallback" }
  | { ok: false; error: string };

export type AssignableAgent = {
  id: string;
  name: string;
  description: string;
  role: string;
  allowedTools: string[];
  enabled: boolean;
};

export type AgentAssignment = {
  subtaskId: string;
  agentId: string;
  agentName: string;
  score: number;
  reason: string;
};

const CAPABILITIES = new Set(["research", "coding", "analysis", "writing", "android", "web", "github", "general"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSupervisorPlan(value: unknown, originalGoal: string): { ok: true; value: SupervisorPlan } | { ok: false; error: string } {
  if (!isRecord(value) || Object.keys(value).some((key) => !["goal", "summary", "subtasks"].includes(key))) {
    return { ok: false, error: "Supervisor plan must contain only goal, summary and subtasks." };
  }
  if (typeof value.goal !== "string" || value.goal.trim().length < 1 || value.goal.length > 500) {
    return { ok: false, error: "Supervisor plan goal must be 1–500 characters." };
  }
  if (typeof value.summary !== "string" || value.summary.trim().length < 1 || value.summary.length > 1000) {
    return { ok: false, error: "Supervisor summary must be 1–1000 characters." };
  }
  if (!Array.isArray(value.subtasks) || value.subtasks.length < 1 || value.subtasks.length > 3) {
    return { ok: false, error: "Supervisor must create between 1 and 3 subtasks." };
  }
  const seen = new Set<string>();
  const subtasks: SupervisorSubtask[] = [];
  for (const raw of value.subtasks) {
    if (!isRecord(raw) || Object.keys(raw).some((key) => !["id", "title", "objective", "requiredCapabilities"].includes(key))) {
      return { ok: false, error: "Each subtask contains unsupported fields." };
    }
    if (typeof raw.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(raw.id) || seen.has(raw.id)) {
      return { ok: false, error: "Subtask IDs must be unique lowercase identifiers." };
    }
    if (typeof raw.title !== "string" || raw.title.trim().length < 1 || raw.title.length > 100) {
      return { ok: false, error: "Each subtask title must be 1–100 characters." };
    }
    if (typeof raw.objective !== "string" || raw.objective.trim().length < 1 || raw.objective.length > 4000) {
      return { ok: false, error: "Each subtask objective must be 1–4000 characters." };
    }
    if (!Array.isArray(raw.requiredCapabilities) || raw.requiredCapabilities.length > 4 ||
        raw.requiredCapabilities.some((item) => typeof item !== "string" || !CAPABILITIES.has(item))) {
      return { ok: false, error: "Subtask capabilities must use the supported capability vocabulary." };
    }
    seen.add(raw.id);
    subtasks.push({
      id: raw.id,
      title: raw.title.trim(),
      objective: raw.objective.trim(),
      requiredCapabilities: [...new Set(raw.requiredCapabilities as string[])],
    });
  }
  return {
    ok: true,
    value: {
      goal: originalGoal.trim().slice(0, 500),
      summary: value.summary.trim(),
      subtasks,
    },
  };
}

function inferCapabilities(text: string): string[] {
  const value = text.toLowerCase();
  const found: string[] = [];
  if (/research|search|source|reference|latest|news|investigat|compare|competitor/.test(value)) found.push("research", "web");
  if (/code|coding|program|debug|bug|fix|repair|patch|refactor|implement|repository|github|software|api/.test(value)) found.push("coding", "github");
  if (/analy[sz]|data|metric|evaluate|audit|review|risk|test|verify/.test(value)) found.push("analysis");
  if (/write|draft|document|report|summari[sz]|content|note|explain/.test(value)) found.push("writing");
  if (/android|phone|device|mobile|permission|app/.test(value)) found.push("android");
  return [...new Set(found.length ? found : ["general"])].slice(0, 4);
}

export function buildFallbackSupervisorPlan(goal: string): SupervisorPlan {
  const clean = goal.trim().replace(/\s+/g, " ");
  const staged = clean.replace(
    /\s+and\s+(?=(?:research|analy[sz]e|write|draft|implement|build|create|prepare|compare|review|test|verify|summari[sz]e|find|investigate|evaluate)\b)/gi,
    "; ",
  );
  const parts = staged
    .split(/\s*(?:\band then\b|\bthen\b|;|\n)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
  const objectives = parts.length ? parts : [clean];
  return {
    goal: clean.slice(0, 500),
    summary: objectives.length > 1
      ? "The goal was separated into " + objectives.length + " bounded workstreams using the local safe planner."
      : "The goal is treated as one bounded workstream; no reliable independent split was detected.",
    subtasks: objectives.map((objective, index) => ({
      id: "workstream-" + (index + 1),
      title: objective.slice(0, 80) || "Workstream " + (index + 1),
      objective,
      requiredCapabilities: inferCapabilities(objective),
    })),
  };
}

function profileText(agent: AssignableAgent): string {
  return [agent.name, agent.description, agent.role].join(" ").toLowerCase();
}

function scoreAgent(agent: AssignableAgent, subtask: SupervisorSubtask): { score: number; reasons: string[] } {
  const profile = profileText(agent);
  const tools = agent.allowedTools.map((tool) => tool.toLowerCase());
  let score = 1;
  const reasons: string[] = [];
  const hasTool = (pattern: RegExp) => tools.some((tool) => pattern.test(tool));
  for (const capability of subtask.requiredCapabilities) {
    if (capability === "research" || capability === "web") {
      if (hasTool(/web\.search|search|browser|remote\.search/)) { score += 5; reasons.push("research/search tools"); }
      if (/research|web|search|analyst/.test(profile)) { score += 3; reasons.push("research role"); }
    } else if (capability === "coding" || capability === "github") {
      if (hasTool(/github\.|code\.|repo|git/)) { score += 5; reasons.push("development/repository tools"); }
      if (/developer|coding|engineer|software|programmer/.test(profile)) { score += 3; reasons.push("engineering role"); }
    } else if (capability === "analysis") {
      if (hasTool(/text\.|analytics|data|metrics/)) { score += 3; reasons.push("analysis tools"); }
      if (/analyst|analysis|research|auditor|qa|quality/.test(profile)) { score += 3; reasons.push("analysis role"); }
    } else if (capability === "writing") {
      if (hasTool(/text\.|document|notes/)) { score += 3; reasons.push("writing tools"); }
      if (/writer|writing|content|documentation|editor/.test(profile)) { score += 3; reasons.push("writing role"); }
    } else if (capability === "android") {
      if (hasTool(/device\.|android\.|mobile/)) { score += 6; reasons.push("Android/device tools"); }
      if (/android|mobile|device/.test(profile)) { score += 4; reasons.push("Android/device role"); }
    } else if (capability === "general") {
      score += 1;
    }
  }
  const words = subtask.objective.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const profileWords = new Set(profile.match(/[a-z]{4,}/g) ?? []);
  const overlap = [...new Set(words)].filter((word) => profileWords.has(word)).length;
  if (overlap) { score += Math.min(3, overlap); reasons.push("objective/profile match"); }
  return { score, reasons };
}

export function assignSubtasksToAgents(
  subtasks: readonly SupervisorSubtask[],
  agents: readonly AssignableAgent[],
): { ok: true; assignments: AgentAssignment[] } | { ok: false; error: string } {
  const enabled = agents.filter((agent) => agent.enabled);
  if (!enabled.length) return { ok: false, error: "No enabled specialist Agents are available. Create or enable an Agent in Agent Manager." };
  if (!subtasks.length || subtasks.length > 3) return { ok: false, error: "Assignment requires between 1 and 3 subtasks." };
  const used = new Set<string>();
  const assignments: AgentAssignment[] = [];
  for (const subtask of subtasks) {
    const ranked = enabled.map((agent) => ({ agent, ...scoreAgent(agent, subtask) }))
      .sort((a, b) => b.score - a.score || a.agent.name.localeCompare(b.agent.name));
    const specialized = subtask.requiredCapabilities.some((capability) => capability !== "general");
    if (specialized && ranked[0].score <= 1) {
      return { ok: false, error: "No enabled Agent matches the required capabilities for subtask: " + subtask.title };
    }
    const distinct = ranked.find((candidate) => !used.has(candidate.agent.id));
    const chosen = distinct ?? ranked[0];
    used.add(chosen.agent.id);
    assignments.push({
      subtaskId: subtask.id,
      agentId: chosen.agent.id,
      agentName: chosen.agent.name,
      score: chosen.score,
      reason: chosen.reasons.length ? chosen.reasons.join(", ") : "best available enabled Agent; no exact capability match was registered",
    });
  }
  return { ok: true, assignments };
}

export function runStageTwoDiagnostics(): Array<{ id: string; status: "passed" | "failed"; detail: string }> {
  const fixture = buildFallbackSupervisorPlan("Research official docs; Analyze security risks; Write a concise report");
  const valid = parseSupervisorPlan(fixture, "Research official docs; Analyze security risks; Write a concise report");
  const invalid = parseSupervisorPlan({ goal: "x", summary: "x", subtasks: [{ id: "bad id", title: "Bad", objective: "x", requiredCapabilities: ["root"] }] }, "x");
  const agents: AssignableAgent[] = [
    { id: "research", name: "Research Agent", description: "Web research and source review", role: "Research analyst", allowedTools: ["web.search"], enabled: true },
    { id: "developer", name: "Developer Agent", description: "Repository implementation", role: "Software engineer", allowedTools: ["github.read_file"], enabled: true },
    { id: "disabled", name: "Disabled Agent", description: "Research", role: "Research", allowedTools: ["web.search"], enabled: false },
  ];
  const assigned = assignSubtasksToAgents([
    { id: "research", title: "Research", objective: "Research official documentation and sources", requiredCapabilities: ["research", "web"] },
    { id: "coding", title: "Code", objective: "Implement code changes in the repository", requiredCapabilities: ["coding", "github"] },
  ], agents);
  const checks = [
    { id: "supervisor_plan_schema", pass: valid.ok && valid.value.subtasks.length === 3, detail: "Valid 3-workstream supervisor plan is accepted." },
    { id: "supervisor_rejects_unsafe_schema", pass: !invalid.ok, detail: "Unsupported capabilities and malformed subtask IDs are rejected." },
    { id: "local_task_planner", pass: fixture.subtasks.length === 3 && fixture.subtasks[1].objective.includes("Analyze"), detail: "Local fallback splits explicit independent objectives into bounded workstreams." },
    { id: "capability_assignment", pass: assigned.ok && assigned.assignments[0]?.agentId === "research" && assigned.assignments[1]?.agentId === "developer", detail: "Research and coding objectives route to matching enabled specialists." },
    { id: "disabled_agent_exclusion", pass: assigned.ok && assigned.assignments.every((item) => item.agentId !== "disabled"), detail: "Disabled Agents are never selected." },
  ];
  return checks.map((check) => ({ id: check.id, status: check.pass ? "passed" : "failed", detail: check.detail }));
}
