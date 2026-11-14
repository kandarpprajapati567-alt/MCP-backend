import "server-only";

import { executeUserWorkflow } from "@/server/ai/routing/runtime-executor";
import type { AIGenerationRequest } from "@/server/ai/providers/types";
import { buildFallbackSupervisorPlan, parseSupervisorPlan, type SupervisorPlanResult } from "@/server/agent/supervisor-orchestrator";

export async function createSupervisorPlan(userId: string, goal: string): Promise<SupervisorPlanResult> {
  if (typeof goal !== "string" || !goal.trim() || goal.trim().length > 4000) {
    return { ok: false, error: "Goal must be between 1 and 4000 characters." };
  }
  const prompt = [
    "You are the Supervisor Agent for Futuristic System.",
    "Convert the user's goal into a safe, concise execution plan for 1 to 3 independent specialist workstreams.",
    "Do not invent completed work, tools, access or facts. Do not request secrets. Keep each objective actionable and self-contained.",
    "Use only these capability labels: research, coding, analysis, writing, android, web, github, general.",
    "Prefer fewer subtasks when work is not genuinely independent. Never exceed 3 subtasks.",
    'Return strict JSON only: {"goal":"...","summary":"...","subtasks":[{"id":"workstream-1","title":"...","objective":"...","requiredCapabilities":["research"]}]}',
  ].join("\n");
  const request: AIGenerationRequest = {
    messages: [{ role: "system", content: prompt }, { role: "user", content: goal.trim() }],
    temperature: 0.1,
    maxOutputTokens: 1400,
  };
  try {
    const execution = await executeUserWorkflow(userId, "planner", request);
    if (execution.route.providerId !== "mock") {
      let decoded: unknown;
      try { decoded = JSON.parse(execution.result.text); }
      catch { return { ok: false, error: "Supervisor returned invalid JSON; no tasks were dispatched." }; }
      const parsed = parseSupervisorPlan(decoded, goal);
      return parsed.ok ? { ...parsed, planner: "configured-ai" } : parsed;
    }
  } catch {
    // A deterministic fallback keeps the planner usable when no provider is configured.
  }
  const fallback = buildFallbackSupervisorPlan(goal);
  const parsed = parseSupervisorPlan(fallback, goal);
  return parsed.ok ? { ...parsed, planner: "safe-local-fallback" } : parsed;
}
