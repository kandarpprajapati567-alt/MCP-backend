import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { buildAgentToolAccessReport } from "@/server/agent/tool-access";
import { listUnifiedAgentTools } from "@/server/agent/unified-tool-catalog";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ agentId: string }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request, context: Context) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const { agentId } = await context.params;
  if (!isUuid(agentId)) return json({ error: "A valid agent ID is required." }, 400);

  try {
    const admin = createAdminClient();
    const { data: agent, error: agentError } = await admin.from("agent_definitions")
      .select("id,allowed_tools")
      .eq("owner_id", PERSONAL_OWNER_ID)
      .eq("id", agentId)
      .maybeSingle();
    if (agentError) return json({ error: "Agent tool access could not be loaded." }, 503);
    if (!agent) return json({ error: "Agent not found." }, 404);

    const registry = await listUnifiedAgentTools();
    const allowedTools = Array.isArray(agent.allowed_tools)
      ? agent.allowed_tools.filter((id): id is string => typeof id === "string")
      : [];

    return json({
      agentId,
      ...buildAgentToolAccessReport(registry.tools, allowedTools),
      sources: registry.sources,
      policy: "Allowlist assignment is not a permission grant. Runtime validation, explicit approval and Android device-side OS permissions and consent remain mandatory.",
      availabilityPolicy: "Availability describes registry state or a recent device heartbeat. It does not guarantee external provider credentials or remote network reachability; those are checked during invocation.",
    });
  } catch {
    return json({ error: "Agent tool access is temporarily unavailable." }, 503);
  }
}
