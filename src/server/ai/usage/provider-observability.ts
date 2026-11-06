import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type ProviderObservation = {
  providerId: "mock" | "openai" | "openrouter";
  outcome: "success" | "failure";
  latencyMs: number;
  errorCode?: "TIMEOUT" | "RATE_LIMITED" | "AUTHENTICATION_FAILED" | "PROVIDER_UNAVAILABLE" | "UNKNOWN";
};

export async function recordProviderObservation(userId: string, observation: ProviderObservation) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("record_ai_provider_observation", {
    p_user_id: userId,
    p_provider_id: observation.providerId,
    p_outcome: observation.outcome,
    p_latency_ms: observation.latencyMs,
    p_error_code: observation.errorCode ?? null,
  });
  if (error) throw new Error("Provider observation could not be recorded.");
}

export async function getProviderObservations(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_ai_provider_observations", {
    p_user_id: userId,
  });
  if (error) throw new Error("Provider observations are unavailable.");
  if (!Array.isArray(data)) throw new Error("Provider observations returned an invalid response.");

  return data.map((row: Record<string, unknown>) => {
    if (
      !["mock", "openai", "openrouter"].includes(String(row.provider_id)) ||
      !Number.isSafeInteger(row.requests_24h) ||
      !Number.isSafeInteger(row.successes_24h) ||
      !Number.isSafeInteger(row.failures_24h) ||
      typeof row.average_latency_ms !== "number" ||
      !Number.isFinite(row.average_latency_ms) ||
      typeof row.last_observed_at !== "string" ||
      !Number.isFinite(Date.parse(row.last_observed_at))
    ) throw new Error("Provider observations returned an invalid response.");

    return {
      providerId: row.provider_id,
      requests24h: row.requests_24h,
      successes24h: row.successes_24h,
      failures24h: row.failures_24h,
      averageLatencyMs: row.average_latency_ms,
      lastObservedAt: row.last_observed_at,
    };
  });
}
