import { NextResponse } from "next/server";
import { verifyOwnerRequest } from "@/server/security/owner-auth";
import { TOOL_CATALOG } from "@/server/tools/registry";
import { listRemoteAgentToolsSafe } from "@/server/mcp/remote";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const remoteTools = await listRemoteAgentToolsSafe();
  return NextResponse.json({ tools: [...TOOL_CATALOG, ...remoteTools], executionPolicy: "allow-listed, schema-validated; remote MCP tools are read-only and server-side" }, { headers: { "Cache-Control": "private, no-store" } });
}
