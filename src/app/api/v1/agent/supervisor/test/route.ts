import { NextResponse } from "next/server";
import { verifyOwnerRequest } from "@/server/security/owner-auth";
import { runStageTwoDiagnostics } from "@/server/agent/supervisor-orchestrator";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const results = runStageTwoDiagnostics();
  const passed = results.filter((item) => item.status === "passed").length;
  const failed = results.filter((item) => item.status === "failed").length;
  return NextResponse.json({
    suite: "stage-2-supervisor-planner-assignment",
    status: failed === 0 ? "passed" : "failed",
    summary: { total: results.length, passed, failed },
    results,
    note: "Deterministic production-module checks; no AI credits consumed and no task records created.",
  }, { status: failed === 0 ? 200 : 500, headers: { "Cache-Control": "private, no-store" } });
}
