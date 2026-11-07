import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseDeviceJobResult } from "@/server/agent/device-contract";
import { finalizeAgentTaskIfReady } from "@/server/agent/task-finalizer";
import { verifyDeviceRequest } from "@/server/security/device-auth";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }

export async function POST(request: Request) {
  const authenticated = await verifyDeviceRequest(request);
  if (!authenticated) return json({ error: "Device authentication required." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const parsed = parseDeviceJobResult(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const input = parsed.value;
  if (input.deviceId !== authenticated.deviceId) return json({ error: "Credential is not valid for this deviceId." }, 403);

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: job, error } = await admin.from("agent_tool_jobs").update({
      status: input.status, result: input.result === undefined ? null : input.result,
      error_code: input.errorCode ?? null, completed_at: now, updated_at: now,
    }).eq("owner_id", authenticated.ownerId)
      .eq("device_id", authenticated.deviceId)
      .eq("id", input.jobId)
      .eq("status", "claimed")
      .select("id,task_id,tool_call_id,tool_id,status")
      .maybeSingle();
    if (error) return json({ error: "Tool result could not be saved." }, 503);
    if (!job) return json({ error: "Job was not found or is no longer claimable." }, 409);

    await admin.from("agent_devices").update({ last_seen_at: now, status: "online" })
      .eq("owner_id", authenticated.ownerId).eq("device_id", authenticated.deviceId);

    if (job.task_id) {
      await admin.from("agent_task_events").insert({
        task_id: job.task_id, owner_id: authenticated.ownerId,
        event_type: input.status === "completed" ? "tool.completed" : "tool.failed",
        payload: { jobId: job.id, toolCallId: job.tool_call_id, toolId: job.tool_id,
          status: input.status, ...(input.errorCode ? { errorCode: input.errorCode } : {}) },
      });
      try { await finalizeAgentTaskIfReady(job.task_id); } catch { /* persisted result can be finalized by recovery */ }
    }
    return json({ ok: true, jobId: job.id, status: job.status });
  } catch {
    return json({ error: "Tool result could not be saved." }, 503);
  }
}
