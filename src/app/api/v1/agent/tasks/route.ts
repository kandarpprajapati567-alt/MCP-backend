import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { submitAgentTask } from "@/server/agent/task-service";
import { readJsonBody } from "@/server/http/read-json";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const admin = createAdminClient();
  const primary = await admin.from("agent_tasks")
    .select("id,status,task,plan,tool_results,result,error_code,agent_definition_id,agent_snapshot,created_at,updated_at,completed_at")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!primary.error) return json({ tasks: primary.data ?? [] });
  if (!/agent_snapshot|agent_definition_id|column .* does not exist/i.test(primary.error.message)) {
    return json({ error: "Unable to load task history." }, 500);
  }
  const legacy = await admin.from("agent_tasks")
    .select("id,status,task,plan,tool_results,result,error_code,created_at,updated_at,completed_at")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .order("created_at", { ascending: false })
    .limit(50);
  if (legacy.error) return json({ error: "Unable to load task history." }, 500);
  return json({ tasks: legacy.data ?? [] });
}

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const parsedBody = await readJsonBody(request, 16000);
  if (!parsedBody.ok) return parsedBody.reason === "too_large"
    ? json({ error: "Request body too large." }, 413)
    : json({ error: "Invalid JSON body." }, 400);
  const body = parsedBody.value;
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
    const status = message.startsWith("Task must") || message.includes("valid agent ID") ? 400
      : message.includes("does not exist") ? 404
        : message.includes("disabled") ? 409 : 503;
    return json({ error: message }, status);
  }
}
