import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseDeviceJobResult } from "@/server/agent/device-contract";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const parsed = parseDeviceJobResult(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  try {
    const admin = createAdminClient();
    const input = parsed.value;
    const now = new Date().toISOString();
    const { data: job, error } = await admin.from("agent_tool_jobs").update({
      status: input.status,
      result: input.result === undefined ? null : input.result,
      error_code: input.errorCode ?? null,
      completed_at: now,
      updated_at: now,
    }).eq("owner_id", PERSONAL_OWNER_ID)
      .eq("device_id", input.deviceId)
      .eq("id", input.jobId)
      .eq("status", "claimed")
      .select("id,task_id,tool_call_id,tool_id,status")
      .maybeSingle();
    if (error) return json({ error: "Tool result could not be saved." }, 503);
    if (!job) return json({ error: "Job was not found or is no longer claimable." }, 409);

    await admin.from("agent_devices").update({ last_seen_at: now, status: "online" })
      .eq("owner_id", PERSONAL_OWNER_ID).eq("device_id", input.deviceId);

    if (job.task_id) {
      await admin.from("agent_task_events").insert({
        task_id: job.task_id,
        owner_id: PERSONAL_OWNER_ID,
        event_type: input.status === "completed" ? "tool.completed" : "tool.failed",
        payload: {
          jobId: job.id,
          toolCallId: job.tool_call_id,
          toolId: job.tool_id,
          status: input.status,
          ...(input.errorCode ? { errorCode: input.errorCode } : {}),
        },
      });
    }
    return json({ ok: true, jobId: job.id, status: job.status });
  } catch {
    return json({ error: "Tool result could not be saved." }, 503);
  }
}
