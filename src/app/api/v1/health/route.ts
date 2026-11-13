import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ServiceStatus = "ok" | "not_configured" | "unavailable";
type AuthenticationStatus = "not_required";

export async function GET() {
  const timestamp = new Date().toISOString();
  const version = "0.1.0-phase-1";
  const commit = process.env.RENDER_GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      {
        status: "degraded",
        timestamp,
        version,
        commit,
        services: {
          database: "not_configured" satisfies ServiceStatus,
          authentication: "not_required" satisfies AuthenticationStatus,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const supabase = await createClient();
    // Probe database connectivity without reading user data or bypassing RLS.
    const { data, error } = await supabase.rpc("health_check");

    const database: ServiceStatus =
      error || data !== true ? "unavailable" : "ok";

    return NextResponse.json(
      {
        status: database === "ok" ? "ok" : "degraded",
        timestamp,
        version,
        commit,
        services: {
          database,
          authentication: "not_required" satisfies AuthenticationStatus,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        timestamp,
        version,
        commit,
        services: {
          database: "unavailable" satisfies ServiceStatus,
          authentication: "ok" satisfies ServiceStatus,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
