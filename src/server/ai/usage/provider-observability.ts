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
    const requests = Number(row.requests_24h);
    const successes = Number(row.successes_24h);
    const failures = Number(row.failures_24h);
    const averageLatencyMs = typeof row.average_latency_ms === "number"
      ? row.average_latency_ms
      : typeof row.average_latency_ms === "string" ? Number(row.average_latency_ms) : NaN;
    if (
      !["mock", "openai", "openrouter"].includes(String(row.provider_id)) ||
      !Number.isSafeInteger(requests) || requests < 0 ||
      !Number.isSafeInteger(successes) || successes < 0 ||
      !Number.isSafeInteger(failures) || failures < 0 ||
      successes + failures !== requests ||
      !Number.isFinite(averageLatencyMs) || averageLatencyMs < 0 ||
      typeof row.last_observed_at !== "string" ||
      !Number.isFinite(Date.parse(row.last_observed_at))
    ) throw new Error("Provider observations returned an invalid response.");

    return {
      providerId: row.provider_id,
      requests24h: requests,
      successes24h: successes,
      failures24h: failures,
      averageLatencyMs,
      lastObservedAt: row.last_observed_at,
    };
  });
}
