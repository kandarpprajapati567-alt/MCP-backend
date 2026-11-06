import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { parseAIUsageDecision, type AIUsageDecision } from "./usage-decision";

export type { AIUsageDecision } from "./usage-decision";

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

  if (error) {
    throw new Error("AI usage controls are unavailable.");
  }
  return parseAIUsageDecision(data);
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
