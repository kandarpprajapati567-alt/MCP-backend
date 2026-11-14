import { NextResponse } from "next/server";
import { verifyOwnerRequest } from "@/server/security/owner-auth";
import { listRemoteMcpAuditEvents } from "@/server/mcp/remote";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const url = new URL(request.url);
  const allowed = new Set(["serverId", "taskId", "limit"]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) {
      return json({ error: "Unsupported or duplicated audit query parameter." }, 400);
    }
  }
  const serverId = url.searchParams.get("serverId") ?? undefined;
  const taskId = url.searchParams.get("taskId") ?? undefined;
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if ((serverId && !UUID_PATTERN.test(serverId)) || (taskId && !UUID_PATTERN.test(taskId)) ||
      !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return json({ error: "Audit filters or limit are invalid." }, 400);
  }
  try {
    const events = await listRemoteMcpAuditEvents({ serverId, taskId, limit });
    return json({ events });
  } catch {
    return json({ error: "Remote MCP audit storage is unavailable. Apply the Remote MCP audit migration." }, 503);
  }
}
