import "server-only";

import type { AIGenerationRequest } from "@/server/ai/providers/types";
import { createRuntimeProviderRegistry } from "@/server/ai/providers/runtime-registry";
import { executeWorkflow } from "@/server/ai/routing/executor";
import { getUserWorkflowPolicy } from "@/server/ai/routing/runtime-executor";
import { DEFAULT_FREE_OPENROUTER_MODEL } from "@/server/ai/routing/agent-provider-policy";
import {
  buildFallbackSupervisorPlan,
  isExplicitFreePlannerModel,
  parseSupervisorPlan,
  type SupervisorPlanResult,
} from "@/server/agent/supervisor-orchestrator";

/**
 * The Supervisor uses OpenRouter only when the owner has connected it.
 * Automatic planning chooses a published :free model; it never falls back to
 * a billable provider. Missing credentials, rate limits or invalid output
 * use the deterministic local planner instead.
 */
export async function createSupervisorPlan(userId: string, goal: string): Promise<SupervisorPlanResult> {
  if (typeof goal !== "string" || !goal.trim() || goal.trim().length > 4000) {
    return { ok: false, error: "Goal must be between 1 and 4000 characters." };
  }

  try {
    const providers = await createRuntimeProviderRegistry(userId);
    const configuredPolicy = await getUserWorkflowPolicy(userId, "planner", providers);
    if (providers.openrouter) {
      const freeModel = isExplicitFreePlannerModel(configuredPolicy.primaryProvider, configuredPolicy.primaryModel)
        ? configuredPolicy.primaryModel
        : DEFAULT_FREE_OPENROUTER_MODEL;
      const request: AIGenerationRequest = {
        messages: [
          {
            role: "system",
            content: [
              "You are the Supervisor Agent for Futuristic System.",
              "Understand the user's overall goal and divide it into 1 to 3 genuinely useful, independently executable workstreams.",
              "Do not invent facts, tools, access, completed work or capabilities. Do not request secrets.",
              "Keep objectives actionable and self-contained. Use only these capability labels: research, coding, analysis, writing, android, web, github, general.",
              'Return strict JSON only: {"goal":"...","summary":"...","subtasks":[{"id":"workstream-1","title":"...","objective":"...","requiredCapabilities":["research"]}]}',
            ].join("\n"),
          },
          { role: "user", content: goal.trim() },
        ],
        temperature: 0.1,
        maxOutputTokens: 1400,
      };
      const execution = await executeWorkflow("planner", {
        primaryProvider: "openrouter",
        primaryModel: freeModel,
        fallbackProviders: ["mock"],
        fallbackModel: "mock-v1",
        requiredCapabilities: ["text-generation"],
      }, providers, request);

      if (execution.route.providerId === "openrouter") {
        try {
          const decoded: unknown = JSON.parse(execution.result.text);
          const parsed = parseSupervisorPlan(decoded, goal);
          if (parsed.ok) return { ...parsed, planner: "configured-ai" };
        } catch {
          // Invalid model output is never dispatched; use the safe local planner.
        }
      }
    }
  } catch {
    // Missing credentials, rate limits or provider errors never trigger a paid fallback.
  }

  const fallback = buildFallbackSupervisorPlan(goal);
  const parsed = parseSupervisorPlan(fallback, goal);
  return parsed.ok ? { ...parsed, planner: "safe-local-fallback" } : parsed;
}
