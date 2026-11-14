export type AgentExecutionMode = "tool_backed" | "model_only";

export type AgentExecutionModeResult =
  | { ok: true; mode: AgentExecutionMode }
  | { ok: false; code: "AGENT_NO_EXECUTION_EVIDENCE" | "AGENT_SOURCE_EVIDENCE_REQUIRED"; message: string };

const SOURCE_REQUIRED_INTENT = /\b(research|search|investigate|look\s+up|latest|current|news|sources?|citations?|references?|verify|fact[ -]?check|find\s+(?:official|reliable|credible|recent|latest|current|sources?|documentation|docs|information|evidence|references?))\b/i;

export function resolveAgentExecutionMode(
  toolCallCount: number,
  plannerProviderId: string,
  task: string,
): AgentExecutionModeResult {
  if (!Number.isInteger(toolCallCount) || toolCallCount < 0) {
    return {
      ok: false,
      code: "AGENT_NO_EXECUTION_EVIDENCE",
      message: "The planner returned an invalid tool-call count.",
    };
  }
  if (toolCallCount > 0) return { ok: true, mode: "tool_backed" };
  if (plannerProviderId === "mock") {
    return {
      ok: false,
      code: "AGENT_NO_EXECUTION_EVIDENCE",
      message: "No tool was executed and no real model planning run was recorded. The task cannot be marked completed.",
    };
  }
  if (SOURCE_REQUIRED_INTENT.test(task)) {
    return {
      ok: false,
      code: "AGENT_SOURCE_EVIDENCE_REQUIRED",
      message: "This request needs source evidence. Assign a working search/source tool and retry; model-only output cannot verify research.",
    };
  }
  return { ok: true, mode: "model_only" };
}
