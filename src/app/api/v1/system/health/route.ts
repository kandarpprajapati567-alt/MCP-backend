import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const endpoint = process.env.FS_BACKEND_HEALTH_URL ?? "https://mcp-backend-2oyj.onrender.com/api/v1/health";
  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
      headers: { Accept: "application/json" },
    });
    const body: unknown = await response.json().catch(() => null);
    return NextResponse.json(
      { reachable: response.ok, httpStatus: response.status, body },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { reachable: false, error: "Render backend health endpoint did not respond within 6 seconds." },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
