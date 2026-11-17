import type { AgentPlan } from "@/shared/agent/contracts";
import type { SynthesisToolResult } from "./synthesis-context";
import { verifySynthesisIntegrity } from "./synthesis-integrity";

export type AgentCompletionEvaluation = {
  verdict: "execution_complete" | "partial" | "needs_review";
  plannedToolCalls: number;
  observedToolResults: number;
  missingToolCallIds: string[];
  failedToolCallIds: string[];
  evidenceIntegrity: "structurally_consistent" | "warning" | "not_applicable";
  independentGoalVerification: "not_performed";
  reasons: string[];
};

/**
 * Deterministic completion evaluation. It checks whether planned operations
 * produced successful observations and whether synthesis citations match them.
 * It deliberately does not claim semantic goal or real-world truth verification.
 */
export function evaluateAgentCompletion(
  plan: AgentPlan,
  toolResults: SynthesisToolResult[],
  answer: string,
): AgentCompletionEvaluation {
  const resultsByCallId = new Map(toolResults.map((item) => [item.callId, item]));
  const missingToolCallIds = plan.toolCalls
    .filter((call) => !resultsByCallId.has(call.id))
    .map((call) => call.id);
  const failedToolCallIds = toolResults
    .filter((item) => {
      if (typeof item.result !== "object" || item.result === null || Array.isArray(item.result)) return false;
      const result = item.result as Record<string, unknown>;
      return result.ok === false ||
        (typeof result.status === "string" &&
          ["failed", "cancelled", "expired", "error"].includes(result.status.toLowerCase()));
    })
    .map((item) => item.callId);
  const integrity = verifySynthesisIntegrity(answer, toolResults);
  const reasons: string[] = [];

  if (plan.toolCalls.length === 0) reasons.push("No planned tool operation exists to independently confirm task execution.");
  if (missingToolCallIds.length) reasons.push("One or more planned tool calls have no persisted result.");
  if (failedToolCallIds.length) reasons.push("One or more tool calls failed or did not complete.");
  if (integrity.status === "warning") reasons.push(...integrity.warnings);

  const verdict = failedToolCallIds.length || missingToolCallIds.length
    ? "partial"
    : plan.toolCalls.length === 0 || integrity.status === "warning"
      ? "needs_review"
      : "execution_complete";

  return {
    verdict,
    plannedToolCalls: plan.toolCalls.length,
    observedToolResults: toolResults.length,
    missingToolCallIds,
    failedToolCallIds,
    evidenceIntegrity: toolResults.length ? integrity.status : "not_applicable",
    independentGoalVerification: "not_performed",
    reasons,
  };
}

export type AgentTaskOutcomeStatus = "completed" | "partial" | "needs_review";

export function deriveAgentTaskOutcomeStatus(
  completion: AgentCompletionEvaluation,
  goal: import("./goal-evaluator").AgentGoalEvaluation,
): AgentTaskOutcomeStatus {
  if (completion.verdict === "partial" || goal.verdict === "partial") return "partial";
  if (completion.verdict === "execution_complete" && goal.verdict === "criteria_covered") return "completed";
  return "needs_review";
}
