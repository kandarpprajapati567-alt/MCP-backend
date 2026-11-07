import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "A JSON object is required." }, 400);
  const input = body as Record<string, unknown>;
  if (typeof input.deviceId !== "string" || !input.deviceId.trim() || input.deviceId.length > 128) {
    return json({ error: "A valid deviceId is required." }, 400);
  }
  const limit = input.limit === undefined ? 5 : input.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 10) {
    return json({ error: "limit must be an integer from 1 to 10." }, 400);
  }

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: device, error: deviceError } = await admin.from("agent_devices").update({
      status: "online",
      last_seen_at: now,
      updated_at: now,
    }).eq("owner_id", PERSONAL_OWNER_ID).eq("device_id", input.deviceId).select("device_id").maybeSingle();
    if (deviceError) return json({ error: "Device heartbeat failed." }, 503);
    if (!device) return json({ error: "Device is not registered." }, 404);

    const { data, error } = await admin.rpc("claim_agent_tool_jobs", {
      p_owner_id: PERSONAL_OWNER_ID,
      p_device_id: input.deviceId,
      p_limit: limit,
    });
    if (error) return json({ error: "Queued jobs could not be claimed." }, 503);
    const jobs = Array.isArray(data) ? data : [];

    for (const job of jobs) {
      if (job.task_id) {
        await admin.from("agent_task_events").insert({
          task_id: job.task_id,
          owner_id: PERSONAL_OWNER_ID,
          event_type: "tool.claimed",
          payload: { jobId: job.id, deviceId: input.deviceId, toolId: job.tool_id, toolCallId: job.tool_call_id },
        });
      }
    }
    return json({ ok: true, deviceId: input.deviceId, jobs });
  } catch {
    return json({ error: "Queued jobs could not be claimed." }, 503);
  }
}
