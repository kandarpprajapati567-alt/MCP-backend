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

async function attachFailureDetails<T extends { id: string }>(
  admin: ReturnType<typeof createAdminClient>,
  tasks: T[],
): Promise<Array<T & { error_message?: string; failed_stage?: string }>> {
  if (!tasks.length) return tasks;
  const { data, error } = await admin.from("agent_task_events")
    .select("task_id,payload")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .eq("event_type", "task.failed")
    .in("task_id", tasks.map((task) => task.id));
  if (error) throw new Error("Task failure diagnostics are unavailable.");

  const failures = new Map<string, { message?: string; stage?: string }>();
  for (const row of data ?? []) {
    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? row.payload as Record<string, unknown>
      : {};
    failures.set(row.task_id, {
      ...(typeof payload.message === "string" ? { message: payload.message.slice(0, 240) } : {}),
      ...(typeof payload.stage === "string" ? { stage: payload.stage.slice(0, 40) } : {}),
    });
  }

  return tasks.map((task) => {
    const failure = failures.get(task.id);
    return {
      ...task,
      ...(failure?.message ? { error_message: failure.message } : {}),
      ...(failure?.stage ? { failed_stage: failure.stage } : {}),
    };
  });
}

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const admin = createAdminClient();
  const primary = await admin.from("agent_tasks")
    .select("id,status,task,plan,tool_results,result,error_code,agent_definition_id,agent_snapshot,created_at,updated_at,completed_at")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!primary.error) {
    try { return json({ tasks: await attachFailureDetails(admin, primary.data ?? []) }); }
    catch { return json({ error: "Unable to load task history diagnostics." }, 500); }
  }
  if (!/agent_snapshot|agent_definition_id|column .* does not exist/i.test(primary.error.message)) {
    return json({ error: "Unable to load task history." }, 500);
  }
  const legacy = await admin.from("agent_tasks")
    .select("id,status,task,plan,tool_results,result,error_code,created_at,updated_at,completed_at")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .order("created_at", { ascending: false })
    .limit(50);
  if (legacy.error) return json({ error: "Unable to load task history." }, 500);
  try { return json({ tasks: await attachFailureDetails(admin, legacy.data ?? []) }); }
  catch { return json({ error: "Unable to load task history diagnostics." }, 500); }
}

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const parsedBody = await readJsonBody(request, 16000);
  if (!parsedBody.ok) return parsedBody.reason === "too_large"
    ? json({ error: "Request body too large." }, 413)
    : json({ error: "Invalid JSON body." }, 400);
  const body = parsedBody.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "A JSON object is required." }, 400);
  }

  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "task" && key !== "agentId")) {
    return json({ error: "Task request contains unsupported fields." }, 400);
  }
  if (typeof input.task !== "string") return json({ error: "task is required." }, 400);
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
