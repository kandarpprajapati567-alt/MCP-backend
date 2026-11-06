import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { parseAIUsageStatus } from "./usage-status";

export async function getAIUsageStatus(userId: string) {
  if (!userId || typeof userId !== "string") {
    throw new Error("An authenticated user is required.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_ai_usage_status", {
    p_user_id: userId,
  });

  if (error) throw new Error("AI usage status is unavailable.");
  return parseAIUsageStatus(data);
}
