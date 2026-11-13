import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { TOOL_CATALOG } from "@/server/tools/registry";
import { listRemoteAgentToolsSafe } from "@/server/mcp/remote";
import { buildAgentToolAccessReport, type AgentToolCandidate } from "@/server/agent/tool-access";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ agentId: string }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

    const [{ data: devices, error: devicesError }, remoteTools] = await Promise.all([
      admin.from("agent_devices").select("device_id,capabilities,status,last_seen_at")
        .eq("owner_id", PERSONAL_OWNER_ID)
        .order("last_seen_at", { ascending: false }),
      listRemoteAgentToolsSafe(),
    ]);
    if (devicesError) return json({ error: "Device capabilities could not be loaded." }, 503);

    const candidates: AgentToolCandidate[] = TOOL_CATALOG
      .filter((tool) => tool.id !== "device.dispatch_tool" && !tool.id.startsWith("agent."))
      .map((tool) => ({
        id: tool.id,
        description: tool.description,
        permission: tool.permission,
        sideEffect: tool.sideEffect,
        target: "backend",
      }));

    for (const tool of remoteTools) {
      candidates.push({
        id: tool.id,
        description: tool.description,
        permission: tool.permission,
        sideEffect: tool.sideEffect,
        target: "remote_mcp",
      });
    }

    const onlineCutoff = Date.now() - 5 * 60 * 1000;
    for (const device of devices ?? []) {
      const lastSeen = typeof device.last_seen_at === "string" ? Date.parse(device.last_seen_at) : Number.NaN;
      const available = device.status === "online" && Number.isFinite(lastSeen) && lastSeen >= onlineCutoff;
      const capabilities = Array.isArray(device.capabilities) ? device.capabilities : [];
      for (const raw of capabilities) {
        if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.description !== "string" ||
            typeof raw.permission !== "string" || typeof raw.sideEffect !== "boolean" ||
            !isRecord(raw.inputSchema) || raw.inputSchema.type !== "object" ||
            !isRecord(raw.inputSchema.properties)) continue;
        candidates.push({
          id: raw.id,
          description: raw.description.slice(0, 500),
          permission: raw.permission,
          sideEffect: raw.sideEffect,
          target: "device",
          available,
        });
      }
    }

    const allowedTools = Array.isArray(agent.allowed_tools)
      ? agent.allowed_tools.filter((id): id is string => typeof id === "string")
      : [];
    return json({
      agentId,
      ...buildAgentToolAccessReport(candidates, allowedTools),
      policy: "Assignment is not a permission grant. Runtime validation, device-side consent and any required approval remain mandatory.",
    });
  } catch {
    return json({ error: "Agent tool access is temporarily unavailable." }, 503);
  }
}
