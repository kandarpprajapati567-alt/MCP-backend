export type ExecutionEvidenceCheck =
  | { ok: true }
  | { ok: false; code: "AGENT_NO_EXECUTION_EVIDENCE" | "AGENT_TOOL_EXECUTION_FAILED"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function inspectExecutionEvidence(value: unknown): ExecutionEvidenceCheck {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      ok: false,
      code: "AGENT_NO_EXECUTION_EVIDENCE",
      message: "No registered tool returned evidence. The task cannot be marked completed.",
    };
  }

  for (const item of value) {
    if (!isRecord(item) || typeof item.toolId !== "string" || !("result" in item)) {
      return {
        ok: false,
        code: "AGENT_NO_EXECUTION_EVIDENCE",
        message: "A tool result was missing its execution identity or output.",
      };
    }
    if (typeof item.status === "string" && item.status !== "completed") {
      return {
        ok: false,
        code: "AGENT_TOOL_EXECUTION_FAILED",
        message: "At least one device tool did not complete successfully.",
      };
    }
    const result = item.result;
    if (isRecord(result) && result.ok === false) {
      return {
        ok: false,
        code: "AGENT_TOOL_EXECUTION_FAILED",
        message: "At least one registered tool call failed.",
      };
    }
    if (isRecord(result) && typeof result.status === "string" &&
        ["failed", "cancelled", "expired"].includes(result.status)) {
      return {
        ok: false,
        code: "AGENT_TOOL_EXECUTION_FAILED",
        message: "At least one device tool did not complete successfully.",
      };
    }
  }

  return { ok: true };
}
