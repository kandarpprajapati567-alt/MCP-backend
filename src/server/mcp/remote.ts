import "server-only";

import { randomUUID } from "node:crypto";
import { resolve4 } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID } from "@/server/security/owner-auth";
import { decryptProviderSecret, encryptProviderSecret } from "@/server/ai/secrets/encryption";
import { isPublicIpv4Address, normalizeRemoteMcpEndpoint, sanitizeRemoteTool, validateRemoteToolArguments, type RemoteMcpTool } from "./remote-contract";
import { boundRemoteMcpContent, runRemoteMcpAuditedInvocation, type RemoteMcpInvocationContext } from "./remote-audit";

const MCP_PROTOCOL_VERSION = "2025-11-25";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;

type JsonRecord = Record<string, unknown>;
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolvePublicAddress(hostname: string): Promise<string> {
  let addresses: string[];
  try {
    addresses = await new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Remote MCP DNS resolution timed out.")), 5_000);
      resolve4(hostname).then(
        (resolved) => { clearTimeout(timer); resolve(resolved); },
        () => { clearTimeout(timer); reject(new Error("DNS resolution failed.")); },
      );
    });
  } catch { throw new Error("Remote MCP hostname could not be resolved to a public IPv4 address within 5 seconds."); }
  if (!addresses.length || addresses.length > 16 || addresses.some((address) => !isPublicIpv4Address(address))) {
    throw new Error("Remote MCP hostname resolves to a blocked or non-public address.");
  }
  return addresses[0];
}

function parseResponseBody(body: string): unknown {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { /* Streamable HTTP may return an SSE event. */ }
  const dataLines = trimmed.split(/\r?\n/u).filter((line) => line.startsWith("data:"));
  if (dataLines.length) {
    const data = dataLines.map((line) => line.slice(5).trim()).filter(Boolean).at(-1);
    if (data) {
      try { return JSON.parse(data); } catch { /* Rejected below. */ }
    }
  }
  throw new Error("Remote MCP server returned an unsupported response.");
}

async function postRemoteMcp(
  url: URL,
  body: JsonRecord,
  bearerToken?: string,
  sessionId?: string,
  protocolVersion?: string,
): Promise<{ status: number; payload: unknown; responseBytes: number; sessionId?: string }> {
  const pinnedAddress = await resolvePublicAddress(url.hostname);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (bearerToken) headers.Authorization = "Bearer " + bearerToken;
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
  const encoded = Buffer.from(JSON.stringify(body), "utf8");

  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      protocol: "https:",
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: "POST",
      headers: { ...headers, "Content-Length": String(encoded.length) },
      servername: url.hostname,
      rejectUnauthorized: true,
      lookup: (_hostname, _options, callback) => callback(null, pinnedAddress, 4),
    }, (res) => {
      const chunks: Buffer[] = [];
      let total = 0;
      res.on("data", (chunk: Buffer | string) => {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += value.length;
        if (total > MAX_RESPONSE_BYTES) {
          req.destroy(new Error("Remote MCP response exceeded the 1 MB limit."));
          return;
        }
        chunks.push(value);
      });
      res.on("end", () => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) return reject(new Error("Remote MCP redirects are not allowed."));
        if (status < 200 || status >= 300) return reject(new Error("Remote MCP request failed with HTTP " + status + "."));
        const responseText = Buffer.concat(chunks).toString("utf8");
        let payload: unknown;
        try { payload = parseResponseBody(responseText); }
        catch (error) { return reject(error); }
        const nextSession = res.headers["mcp-session-id"];
        resolve({ status, payload, responseBytes: total, ...(typeof nextSession === "string" ? { sessionId: nextSession } : {}) });
      });
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error("Remote MCP request timed out.")));
    req.on("error", reject);
    req.end(encoded);
  });
}

function rpcResult(payload: unknown): JsonRecord {
  if (!isRecord(payload) || payload.jsonrpc !== "2.0" || !isRecord(payload.result)) {
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
      throw new Error("Remote MCP error: " + payload.error.message.slice(0, 180));
    }
    throw new Error("Remote MCP returned an invalid JSON-RPC response.");
  }
  return payload.result;
}

async function openRemoteSession(url: URL, token?: string) {
  const initialized = await postRemoteMcp(url, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "futuristic-system", version: "1.0.0" } },
  }, token);
  const init = rpcResult(initialized.payload);
  if (typeof init.protocolVersion !== "string" || init.protocolVersion !== MCP_PROTOCOL_VERSION) {
    throw new Error("Remote MCP server selected an unsupported protocol version.");
  }
  const sessionId = initialized.sessionId;
  await postRemoteMcp(url, { jsonrpc: "2.0", method: "notifications/initialized" }, token, sessionId, MCP_PROTOCOL_VERSION);
  return { sessionId };
}

export async function registerRemoteMcpServer(input: { name: string; endpoint: string; bearerToken?: string }) {
  const name = input.name.trim();
  if (!name || name.length > 80) throw new Error("Server name must be between 1 and 80 characters.");
  if (input.bearerToken !== undefined && (input.bearerToken.length < 8 || input.bearerToken.length > 4096 || input.bearerToken.trim() !== input.bearerToken)) {
    throw new Error("Bearer token must be between 8 and 4096 characters without surrounding whitespace.");
  }
  const endpoint = normalizeRemoteMcpEndpoint(input.endpoint);
  const serverId = randomUUID();
  const { sessionId } = await openRemoteSession(endpoint, input.bearerToken);
  const response = await postRemoteMcp(endpoint, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, input.bearerToken, sessionId, MCP_PROTOCOL_VERSION);
  const result = rpcResult(response.payload);
  if (!Array.isArray(result.tools) || result.tools.length > 100 || result.nextCursor !== undefined) throw new Error("Remote MCP tools/list response is invalid, paginated, or exceeds the 100-tool limit.");
  const tools = result.tools.map((tool) => sanitizeRemoteTool(serverId, tool)).filter((tool): tool is RemoteMcpTool => tool !== null);
  if (!tools.length) throw new Error("No safe read-only tools were discovered. Only tools explicitly marked readOnlyHint are accepted.");
  const encrypted = input.bearerToken ? encryptProviderSecret(input.bearerToken) : null;
  const admin = createAdminClient();
  const { data, error } = await admin.from("remote_mcp_servers").insert({
    id: serverId,
    owner_id: PERSONAL_OWNER_ID,
    name,
    endpoint_url: endpoint.toString(),
    ...(encrypted ?? { encrypted_secret: null, iv: null, auth_tag: null, key_version: null }),
    enabled: true,
    discovered_tools: tools,
    protocol_version: MCP_PROTOCOL_VERSION,
  }).select("id,name,endpoint_url,enabled,discovered_tools,created_at").single();
  if (error || !data) throw new Error("Remote MCP connection could not be saved.");
  return { server: data, tools };
}

export async function testRemoteMcpServer(serverId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(serverId)) throw new Error("A valid remote MCP server ID is required.");
  const admin = createAdminClient();
  const { data: server, error } = await admin.from("remote_mcp_servers")
    .select("id,endpoint_url,encrypted_secret,iv,auth_tag,key_version,enabled")
    .eq("owner_id", PERSONAL_OWNER_ID).eq("id", serverId).maybeSingle();
  if (error || !server || !server.enabled) throw new Error("Remote MCP server is not connected.");
  const endpoint = normalizeRemoteMcpEndpoint(server.endpoint_url);
  const token = server.encrypted_secret
    ? decryptProviderSecret({ encrypted_secret: server.encrypted_secret, iv: server.iv, auth_tag: server.auth_tag, key_version: server.key_version })
    : undefined;
  const { sessionId } = await openRemoteSession(endpoint, token);
  const response = await postRemoteMcp(endpoint, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, token, sessionId, MCP_PROTOCOL_VERSION);
  const result = rpcResult(response.payload);
  if (!Array.isArray(result.tools) || result.tools.length > 100 || result.nextCursor !== undefined) {
    throw new Error("Remote MCP tools/list response is invalid, paginated, or exceeds the 100-tool limit.");
  }
  const tools = result.tools.map((tool) => sanitizeRemoteTool(serverId, tool)).filter((tool): tool is RemoteMcpTool => tool !== null);
  if (!tools.length) throw new Error("Connection responded, but no explicitly read-only tools were discovered.");
  const { error: updateError } = await admin.from("remote_mcp_servers")
    .update({ discovered_tools: tools, protocol_version: MCP_PROTOCOL_VERSION })
    .eq("owner_id", PERSONAL_OWNER_ID).eq("id", serverId);
  if (updateError) throw new Error("Remote MCP responded, but its tool manifest could not be refreshed.");
  return { connected: true, checkedAt: new Date().toISOString(), tools };
}

export async function listRemoteMcpServers() {
  const { data, error } = await createAdminClient().from("remote_mcp_servers")
    .select("id,name,endpoint_url,enabled,discovered_tools,created_at,updated_at")
    .eq("owner_id", PERSONAL_OWNER_ID).order("created_at", { ascending: false }).limit(30);
  if (error) throw new Error("Remote MCP connections are unavailable. Apply the Remote MCP migration.");
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    endpoint: row.endpoint_url,
    enabled: row.enabled,
    tools: Array.isArray(row.discovered_tools) ? row.discovered_tools : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function listRemoteAgentTools() {
  const servers = await listRemoteMcpServers();
  return servers.filter((server) => server.enabled).flatMap((server) =>
    (server.tools as RemoteMcpTool[]).map((tool) => ({
      id: tool.id,
      description: tool.description,
      permission: "remote_mcp.read",
      sideEffect: false,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    })),
  );
}

export async function listRemoteAgentToolsSafe() {
  try { return await listRemoteAgentTools(); } catch { return []; }
}

export async function disconnectRemoteMcpServer(serverId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(serverId)) throw new Error("A valid remote MCP server ID is required.");
  const { error, count } = await createAdminClient().from("remote_mcp_servers")
    .delete({ count: "exact" }).eq("owner_id", PERSONAL_OWNER_ID).eq("id", serverId);
  if (error || count === 0) throw new Error("Remote MCP server could not be disconnected.");
  return { disconnected: true, serverId };
}

export async function callRemoteMcpTool(
  toolId: string,
  args: Record<string, unknown>,
  context?: RemoteMcpInvocationContext,
) {
  const match = toolId.match(/^remote_mcp\\.([0-9a-f-]{36})\\.([A-Za-z0-9][A-Za-z0-9_.-]{0,79})$/u);
  if (!match) throw new Error("Remote MCP tool identifier is invalid.");
  const [, serverId, toolName] = match;
  const admin = createAdminClient();
  const { data: server, error } = await admin.from("remote_mcp_servers")
    .select("endpoint_url,encrypted_secret,iv,auth_tag,key_version,enabled,discovered_tools")
    .eq("owner_id", PERSONAL_OWNER_ID).eq("id", serverId).maybeSingle();
  if (error || !server || !server.enabled) throw new Error("Remote MCP server is not connected.");
  const tools = Array.isArray(server.discovered_tools) ? server.discovered_tools as RemoteMcpTool[] : [];
  const tool = tools.find((item) => item.id === toolId && item.name === toolName);
  if (!tool || !validateRemoteToolArguments(tool.inputSchema, args)) throw new Error("Remote MCP tool arguments failed validation.");
  const endpoint = normalizeRemoteMcpEndpoint(server.endpoint_url);
  const token = server.encrypted_secret
    ? decryptProviderSecret({ encrypted_secret: server.encrypted_secret, iv: server.iv, auth_tag: server.auth_tag, key_version: server.key_version })
    : undefined;

  const auditId = randomUUID();
  const startedAt = new Date().toISOString();
  return runRemoteMcpAuditedInvocation({
    id: auditId,
    ownerId: PERSONAL_OWNER_ID,
    serverId,
    toolId,
    toolName,
    source: context?.source ?? "unknown",
    ...(context?.taskId ? { taskId: context.taskId } : {}),
    args,
    startedAt,
  }, {
    start: async (record) => {
      const { data, error: auditError } = await admin.from("remote_mcp_audit_events")
        .insert(record).select("id").single();
      if (auditError || !data) throw new Error("Remote MCP audit storage is unavailable; invocation was blocked.");
    },
    complete: async (patch) => {
      const { data, error: auditError } = await admin.from("remote_mcp_audit_events")
        .update(patch).eq("owner_id", PERSONAL_OWNER_ID).eq("id", auditId)
        .select("id").maybeSingle();
      if (auditError || !data) throw new Error("Remote MCP audit completion could not be persisted.");
    },
    fail: async (patch) => {
      const { error: auditError } = await admin.from("remote_mcp_audit_events")
        .update(patch).eq("owner_id", PERSONAL_OWNER_ID).eq("id", auditId);
      if (auditError) throw new Error("Remote MCP failure audit could not be persisted.");
    },
    pending: async (patch) => {
      const { error: auditError } = await admin.from("remote_mcp_audit_events")
        .update(patch).eq("owner_id", PERSONAL_OWNER_ID).eq("id", auditId);
      if (auditError) throw new Error("Remote MCP pending audit could not be persisted.");
    },
  }, async () => {
    const { sessionId } = await openRemoteSession(endpoint, token);
    const response = await postRemoteMcp(endpoint, {
      jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: toolName, arguments: args },
    }, token, sessionId, MCP_PROTOCOL_VERSION);
    const result = rpcResult(response.payload);
    if (result.isError === true) throw new Error("Remote MCP tool reported an execution error.");
    const content = boundRemoteMcpContent(result.content);
    const value = { server: serverId, tool: toolName, content };
    return {
      value,
      responseBytes: response.responseBytes,
      outputBytes: Buffer.byteLength(JSON.stringify(value), "utf8"),
      contentItems: content.length,
    };
  });
}

export async function listRemoteMcpAuditEvents(filters: {
  serverId?: string;
  taskId?: string;
  limit?: number;
} = {}) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if ((filters.serverId && !uuidPattern.test(filters.serverId)) ||
      (filters.taskId && !uuidPattern.test(filters.taskId))) {
    throw new Error("Remote MCP audit filters are invalid.");
  }
  const limit = filters.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Remote MCP audit limit is invalid.");
  let query = createAdminClient().from("remote_mcp_audit_events")
    .select("id,server_id,task_id,tool_id,tool_name,source,argument_digest,status,started_at,completed_at,duration_ms,response_bytes,output_bytes,content_items,error_code")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filters.serverId) query = query.eq("server_id", filters.serverId);
  if (filters.taskId) query = query.eq("task_id", filters.taskId);
  const { data, error } = await query;
  if (error) throw new Error("Remote MCP audit history is unavailable.");
  return data ?? [];
}
