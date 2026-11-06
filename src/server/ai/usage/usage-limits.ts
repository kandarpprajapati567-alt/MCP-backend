import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface AIUsageDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  reason: string;
}

/** Atomically reserves a request against per-user limits in shared Postgres storage. */
export async function consumeAIRequest(
  userId: string,
  inputCharacters: number,
): Promise<AIUsageDecision> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_ai_request", {
    p_user_id: userId,
    p_input_characters: inputCharacters,
  });

  if (error || !Array.isArray(data) || data.length !== 1) {
    throw new Error("AI usage controls are unavailable.");
  }

  const row = data[0] as {
    allowed?: unknown;
    retry_after_seconds?: unknown;
    reason?: unknown;
  };
  if (
    typeof row.allowed !== "boolean" ||
    typeof row.retry_after_seconds !== "number" ||
    typeof row.reason !== "string"
  ) {
    throw new Error("AI usage controls returned an invalid response.");
  }

  return {
    allowed: row.allowed,
    retryAfterSeconds: Math.max(0, Math.ceil(row.retry_after_seconds)),
    reason: row.reason,
  };
}

export async function recordAIOutputUsage(userId: string, outputTokens: number) {
  if (!Number.isSafeInteger(outputTokens) || outputTokens < 0) return;
  const admin = createAdminClient();
  const { error } = await admin.rpc("record_ai_output_usage", {
    p_user_id: userId,
    p_output_tokens: outputTokens,
  });
  if (error) throw new Error("AI usage accounting is unavailable.");
}
