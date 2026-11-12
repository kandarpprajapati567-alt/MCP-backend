import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptProviderSecret } from "@/server/ai/secrets/encryption";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { readJsonBody } from "@/server/http/read-json";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  try {
    const admin = createAdminClient();
    const [integrationResult, remoteResult] = await Promise.all([
      admin.from("integration_connections").select("provider,enabled,created_at,updated_at").eq("owner_id", PERSONAL_OWNER_ID).order("provider"),
      admin.from("remote_mcp_servers").select("id,enabled,discovered_tools").eq("owner_id", PERSONAL_OWNER_ID),
    ]);
    if (integrationResult.error) return json({ error: "Connections are unavailable. Apply the Connections migration." }, 503);
    const configured = new Set((integrationResult.data ?? []).filter((row) => row.enabled).map((row) => row.provider));
    const remoteServers = remoteResult.error ? [] : (remoteResult.data ?? []).filter((row) => row.enabled);
    const remoteToolCount = remoteServers.reduce((count, row) => count + (Array.isArray(row.discovered_tools) ? row.discovered_tools.length : 0), 0);
    return json({
      connections: [
        { id: "github", name: "GitHub", category: "Developer", connected: Boolean(process.env.GITHUB_READ_TOKEN), status: process.env.GITHUB_READ_TOKEN ? "connected" : "needs_credential", tools: ["github.list_branches", "github.list_commits", "github.list_files", "github.read_file"], setup: "Configure GITHUB_READ_TOKEN on the backend with read-only repository access." },
        { id: "tavily", name: "Web Search", category: "Research", connected: configured.has("tavily"), status: configured.has("tavily") ? "connected" : "not_connected", tools: ["web.search"], setup: "Connect a Tavily API key below." },
        { id: "mcp_remote", name: "Remote MCP Servers", category: "MCP", connected: remoteServers.length > 0, status: remoteResult.error ? "migration_required" : remoteServers.length > 0 ? "connected" : "not_connected", tools: [], setup: remoteResult.error ? "Apply the Remote MCP migration to enable secure server registration." : remoteServers.length + " connected server(s) · " + remoteToolCount + " read-only tool(s) discovered. Add servers below." },
      ],
    });
  } catch {
    return json({ error: "Connections are temporarily unavailable." }, 503);
  }
}

export async function PUT(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const parsed = await readJsonBody(request, 8192);
  if (!parsed.ok) return parsed.reason === "too_large" ? json({ error: "Request body too large." }, 413) : json({ error: "Invalid JSON body." }, 400);
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return json({ error: "A JSON object is required." }, 400);
  const input = parsed.value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "provider" && key !== "apiKey") ||
      input.provider !== "tavily" || typeof input.apiKey !== "string" ||
      input.apiKey.trim() !== input.apiKey || input.apiKey.length < 8 || input.apiKey.length > 4096) {
    return json({ error: "A valid Tavily API key is required." }, 400);
  }
  try {
    const encrypted = encryptProviderSecret(input.apiKey);
    const { error } = await createAdminClient().from("integration_connections").upsert({
      owner_id: PERSONAL_OWNER_ID, provider: "tavily", ...encrypted, enabled: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "owner_id,provider" });
    if (error) return json({ error: "Web Search credential could not be saved." }, 503);
    return json({ saved: true, provider: "tavily", connected: true }, 201);
  } catch {
    return json({ error: "Encrypted connection storage is not configured or available." }, 503);
  }
}

export async function DELETE(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const parsed = await readJsonBody(request, 1024);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value) ||
      (parsed.value as Record<string, unknown>).provider !== "tavily") return json({ error: "A valid provider is required." }, 400);
  try {
    const { error } = await createAdminClient().from("integration_connections").delete()
      .eq("owner_id", PERSONAL_OWNER_ID).eq("provider", "tavily");
    if (error) return json({ error: "Web Search connection could not be removed." }, 503);
    return json({ deleted: true, provider: "tavily" });
  } catch {
    return json({ error: "Connection storage is unavailable." }, 503);
  }
}
