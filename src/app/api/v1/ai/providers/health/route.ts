import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRuntimeProviderRegistry } from "@/server/ai/providers/runtime-registry";
import { getProviderObservations } from "@/server/ai/usage/provider-observability";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return privateJson({ error: "Unauthorized." }, 401);

  try {
    const [providers, observations] = await Promise.all([
      createRuntimeProviderRegistry(data.user.id),
      getProviderObservations(data.user.id),
    ]);
    const metrics = new Map(observations.map((item) => [item.providerId, item]));
    const entries = Object.entries(providers).map(([id, provider]) => ({
      id,
      configured: id === "mock" || id in providers,
      status: "ready" as const,
      capabilities: provider.capabilities,
      checkType: id === "mock" ? "self-test-adapter" : "credential-configured",
      observed24h: metrics.get(id) ?? null,
    }));

    return privateJson({
      ok: entries.some((entry) => entry.id === "mock"),
      checkedAt: new Date().toISOString(),
      billingImpact: "none",
      vendorConnectivityTested: false,
      monitoring: "passive-generation-observations",
      observationWindow: "24h",
      providers: entries,
    });
  } catch {
    return privateJson({ ok: false, error: "Provider diagnostics could not be checked." }, 503);
  }
}
