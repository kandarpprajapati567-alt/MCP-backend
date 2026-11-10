import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { submitAgentTask } from "@/server/agent/task-service";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const admin = createAdminClient();
  const { data, error } = await admin.from("agent_tasks")
    .select("id,status,task,plan,tool_results,result,error_code,agent_definition_id,agent_snapshot,created_at,updated_at,completed_at")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return json({ error: "Unable to load task history." }, 500);
  return json({ tasks: data ?? [] });
}

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 16000) return json({ error: "Request body too large." }, 413);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof (body as Record<string, unknown>).task !== "string") {
    return json({ error: "task is required." }, 400);
  }

  const input = body as { task: string; agentId?: unknown };
  if (input.agentId !== undefined && (typeof input.agentId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.agentId))) {
    return json({ error: "agentId must be a valid Agent UUID." }, 400);
  }

  try {
    const result = await submitAgentTask(input.task, input.agentId as string | undefined);
    const status = result.status === "failed" ? 500 : result.status === "waiting_for_device" ? 202 : 201;
    return json(result, status);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unable to submit task.";
    return json({ error: message }, message.startsWith("Task must") ? 400 : 503);
  }
}
