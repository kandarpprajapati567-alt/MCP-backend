import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID } from "@/server/security/owner-auth";
import { TOOL_CATALOG } from "@/server/tools/registry";
import { listRemoteMcpServers } from "@/server/mcp/remote";
import type { AgentToolCandidate } from "@/server/agent/tool-access";

type UnifiedAgentTool = AgentToolCandidate & {
  inputSchema?: unknown;
  annotations?: unknown;
  availabilityNote: string;
};

type SourceStatus = "available" | "unavailable";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Build one read-only inventory from code-owned backend tools, owner-scoped
 * Remote MCP manifests and recent device capability heartbeats. This is an
 * inventory snapshot, not a promise that an external dependency will respond.
 */
export async function listUnifiedAgentTools(): Promise<{
  tools: UnifiedAgentTool[];
  sources: { backend: SourceStatus; remoteMcp: SourceStatus; devices: SourceStatus };
}> {
  const admin = createAdminClient();
  const [deviceResult, remoteResult] = await Promise.all([
    admin.from("agent_devices")
      .select("device_id,capabilities,status,last_seen_at")
      .eq("owner_id", PERSONAL_OWNER_ID)
      .order("last_seen_at", { ascending: false }),
    listRemoteMcpServers().then((servers) => ({ servers, available: true as const }))
      .catch(() => ({ servers: [], available: false as const })),
  ]);

  const byId = new Map<string, UnifiedAgentTool>();
  const add = (tool: UnifiedAgentTool) => {
    const existing = byId.get(tool.id);
    if (!existing || (tool.available === true && existing.available !== true)) byId.set(tool.id, tool);
  };

  for (const tool of TOOL_CATALOG) {
    if (tool.id === "device.dispatch_tool" || tool.id.startsWith("agent.")) continue;
    add({
      id: tool.id,
      description: tool.description,
      permission: tool.permission,
      sideEffect: tool.sideEffect,
      target: "backend",
      available: true,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      availabilityNote: "Registered in the server catalog; dependency health is checked when invoked.",
    });
  }

  for (const server of remoteResult.servers) {
    const remoteTools = Array.isArray(server.tools) ? server.tools : [];
    for (const raw of remoteTools) {
      if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.description !== "string") continue;
      add({
        id: raw.id,
        description: raw.description.slice(0, 500),
        permission: "remote_mcp.read",
        sideEffect: false,
        target: "remote_mcp",
        available: server.enabled === true,
        inputSchema: raw.inputSchema,
        annotations: raw.annotations,
        availabilityNote: server.enabled === true
          ? "Connection is enabled; live reachability is checked during invocation."
          : "Remote MCP connection is disabled.",
      });
    }
  }

  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const device of deviceResult.data ?? []) {
    const lastSeen = typeof device.last_seen_at === "string" ? Date.parse(device.last_seen_at) : Number.NaN;
    const available = device.status === "online" && Number.isFinite(lastSeen) && lastSeen >= cutoff && lastSeen <= Date.now();
    const capabilities = Array.isArray(device.capabilities) ? device.capabilities : [];
    for (const raw of capabilities) {
      if (!isRecord(raw) || typeof raw.id !== "string" || !/^[a-z][a-z0-9_.-]{1,159}$/u.test(raw.id) ||
          typeof raw.description !== "string" || typeof raw.permission !== "string" ||
          typeof raw.sideEffect !== "boolean" || !isRecord(raw.inputSchema) ||
          raw.inputSchema.type !== "object" || !isRecord(raw.inputSchema.properties)) continue;
      const properties = raw.inputSchema.properties;
      if (Object.keys(properties).length > 32) continue;
      add({
        id: raw.id,
        description: raw.description.slice(0, 500),
        permission: raw.permission.slice(0, 120),
        sideEffect: raw.sideEffect,
        target: "device",
        available,
        inputSchema: {
          type: "object",
          properties,
          required: Array.isArray(raw.inputSchema.required)
            ? raw.inputSchema.required.filter((item): item is string => typeof item === "string").slice(0, 32)
            : [],
          additionalProperties: false,
        },
        annotations: isRecord(raw.annotations) ? raw.annotations : undefined,
        availabilityNote: available
          ? "Device heartbeat is recent (within five minutes). Android permissions and consent are still checked on-device."
          : "Device is offline or its heartbeat is older than five minutes.",
      });
    }
  }

  return {
    tools: [...byId.values()],
    sources: {
      backend: "available",
      remoteMcp: remoteResult.available ? "available" : "unavailable",
      devices: deviceResult.error ? "unavailable" : "available",
    },
  };
}
