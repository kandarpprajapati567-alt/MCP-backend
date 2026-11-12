import { NextResponse } from "next/server";
import { verifyOwnerRequest } from "@/server/security/owner-auth";
import { readJsonBody } from "@/server/http/read-json";
import { disconnectRemoteMcpServer, listRemoteMcpServers, registerRemoteMcpServer } from "@/server/mcp/remote";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  try { return json({ servers: await listRemoteMcpServers() }); }
  catch { return json({ error: "Remote MCP connections are unavailable. Apply the Remote MCP migration." }, 503); }
}

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const parsed = await readJsonBody(request, 8192);
  if (!parsed.ok) return parsed.reason === "too_large"
    ? json({ error: "Request body too large." }, 413)
    : json({ error: "Invalid JSON body." }, 400);
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return json({ error: "A JSON object is required." }, 400);
  const input = parsed.value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["name", "endpoint", "bearerToken"].includes(key)) ||
      typeof input.name !== "string" || typeof input.endpoint !== "string" ||
      (input.bearerToken !== undefined && typeof input.bearerToken !== "string")) {
    return json({ error: "name, endpoint and an optional bearerToken are required." }, 400);
  }
  try {
    const result = await registerRemoteMcpServer({
      name: input.name,
      endpoint: input.endpoint,
      ...(typeof input.bearerToken === "string" && input.bearerToken ? { bearerToken: input.bearerToken } : {}),
    });
    return json({ connected: true, server: result.server, tools: result.tools }, 201);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Remote MCP connection failed.";
    return json({ error: message.slice(0, 240) }, 400);
  }
}

export async function DELETE(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const parsed = await readJsonBody(request, 1024);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value) ||
      typeof (parsed.value as Record<string, unknown>).serverId !== "string") {
    return json({ error: "A valid serverId is required." }, 400);
  }
  try { return json(await disconnectRemoteMcpServer((parsed.value as Record<string, string>).serverId)); }
  catch (cause) { return json({ error: cause instanceof Error ? cause.message : "Remote MCP disconnect failed." }, 400); }
}
