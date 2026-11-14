import { buildFallbackSupervisorPlan, parseSupervisorPlan, type SupervisorPlanResult } from "@/server/agent/supervisor-orchestrator";

/**
 * Zero-cost Supervisor implementation.
 * It uses deterministic local goal decomposition and never invokes a paid provider.
 * A provider-backed planner can be enabled later only behind an explicit free-model policy.
 */
export async function createSupervisorPlan(_userId: string, goal: string): Promise<SupervisorPlanResult> {
  if (typeof goal !== "string" || !goal.trim() || goal.trim().length > 4000) {
    return { ok: false, error: "Goal must be between 1 and 4000 characters." };
  }
  const fallback = buildFallbackSupervisorPlan(goal);
  const parsed = parseSupervisorPlan(fallback, goal);
  return parsed.ok ? { ...parsed, planner: "safe-local-fallback" } : parsed;
}
