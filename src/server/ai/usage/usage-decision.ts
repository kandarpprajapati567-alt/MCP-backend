export interface AIUsageDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  reason: string;
}

export function parseAIUsageDecision(data: unknown): AIUsageDecision {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error("AI usage controls returned an invalid response.");
  }

  const row = data[0] as {
    allowed?: unknown;
    retry_after_seconds?: unknown;
    reason?: unknown;
  };
  if (
    !row ||
    typeof row.allowed !== "boolean" ||
    typeof row.retry_after_seconds !== "number" ||
    !Number.isFinite(row.retry_after_seconds) ||
    typeof row.reason !== "string" ||
    row.reason.length < 1 ||
    row.reason.length > 64
  ) {
    throw new Error("AI usage controls returned an invalid response.");
  }

  return {
    allowed: row.allowed,
    retryAfterSeconds: Math.max(0, Math.ceil(row.retry_after_seconds)),
    reason: row.reason,
  };
}
