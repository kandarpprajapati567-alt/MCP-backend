import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ServiceStatus = "ok" | "not_configured" | "unavailable" | "error";

interface HealthResponse {
  status: "ok" | "degraded";
  timestamp: string;
  version: string;
  services: {
    database: ServiceStatus;
    search: ServiceStatus;
    mcp: ServiceStatus;
  };
}

export async function GET() {
  const body: HealthResponse = {
    status: "degraded",
    timestamp: new Date().toISOString(),
    version: "0.1.0-stage-b-ui",
    services: {
      database: "not_configured",
      search: "not_configured",
      mcp: "not_configured",
    },
  };

  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
