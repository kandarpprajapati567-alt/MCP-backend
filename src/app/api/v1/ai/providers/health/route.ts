import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRuntimeProviderRegistry } from "@/server/ai/providers/runtime-registry";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Reports provider configuration/readiness for the authenticated user.
 * This is intentionally a non-billing diagnostic: it never sends a vendor
 * generation request or exposes credentials.
 */
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return privateJson({ error: "Unauthorized." }, 401);
  }

  try {
    const providers = await createRuntimeProviderRegistry(data.user.id);
    const entries = Object.entries(providers).map(([id, provider]) => ({
      id,
      configured: id === "mock" || id in providers,
      status: "ready" as const,
      capabilities: provider.capabilities,
      checkType: id === "mock" ? "self-test-adapter" : "credential-configured",
    }));

    return privateJson({
      ok: entries.some((entry) => entry.id === "mock"),
      checkedAt: new Date().toISOString(),
      billingImpact: "none",
      vendorConnectivityTested: false,
      providers: entries,
    });
  } catch {
    return privateJson({
      ok: false,
      error: "Provider configuration could not be checked.",
    }, 503);
  }
}
