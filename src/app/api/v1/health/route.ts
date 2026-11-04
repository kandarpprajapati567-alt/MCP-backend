import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ServiceStatus = "ok" | "not_configured" | "unavailable";

export async function GET() {
  const timestamp = new Date().toISOString();
  const version = "0.1.0-phase-1";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      {
        status: "degraded",
        timestamp,
        version,
        services: {
          database: "not_configured" satisfies ServiceStatus,
          authentication: "not_configured" satisfies ServiceStatus,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").select("id").limit(1);

    const database: ServiceStatus = error ? "unavailable" : "ok";
    return NextResponse.json(
      {
        status: database === "ok" ? "ok" : "degraded",
        timestamp,
        version,
        services: {
          database,
          authentication: "ok" satisfies ServiceStatus,
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
        services: {
          database: "unavailable" satisfies ServiceStatus,
          authentication: "unavailable" satisfies ServiceStatus,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
