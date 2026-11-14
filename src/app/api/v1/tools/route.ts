import { NextResponse } from "next/server";
import { verifyOwnerRequest } from "@/server/security/owner-auth";
import { TOOL_CATALOG } from "@/server/tools/registry";
import { listUnifiedAgentTools } from "@/server/agent/unified-tool-catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const registry = await listUnifiedAgentTools();
    return NextResponse.json({
      tools: [
        ...TOOL_CATALOG.filter((tool) => tool.id === "device.dispatch_tool" || tool.id.startsWith("agent.")),
        ...registry.tools,
      ],
      sources: registry.sources,
      executionPolicy: "Allowlisted and schema-validated. Device permissions and consent remain enforced by the Android runtime.",
      availabilityPolicy: "Backend tools are code-registered; Remote MCP tools require an enabled connection; device tools require a heartbeat within five minutes. External reachability and credentials are checked at invocation.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Unified tool registry is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
