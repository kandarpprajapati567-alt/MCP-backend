import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseDeviceJobDispatch } from "@/server/agent/device-contract";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const parsed = parseDeviceJobDispatch(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  try {
    const admin = createAdminClient();
    const input = parsed.value;
    const { data: device, error: deviceError } = await admin.from("agent_devices")
      .select("device_id,capabilities")
      .eq("owner_id", PERSONAL_OWNER_ID)
      .eq("device_id", input.deviceId)
      .maybeSingle();
    if (deviceError) return json({ error: "Device registry is unavailable." }, 503);
    if (!device) return json({ error: "Device is not registered." }, 404);

    const capabilities = Array.isArray(device.capabilities) ? device.capabilities as Array<{ id?: unknown }> : [];
    if (!capabilities.some((capability) => capability && capability.id === input.toolId)) {
      return json({ error: "The requested tool is not registered by this device." }, 409);
    }

    if (input.taskId) {
      const { data: task, error: taskError } = await admin.from("agent_tasks")
        .select("id,status")
        .eq("owner_id", PERSONAL_OWNER_ID)
        .eq("id", input.taskId)
        .maybeSingle();
      if (taskError) return json({ error: "Task registry is unavailable." }, 503);
      if (!task) return json({ error: "Task not found." }, 404);
    }

    const { data: job, error } = await admin.from("agent_tool_jobs").insert({
      owner_id: PERSONAL_OWNER_ID,
      task_id: input.taskId ?? null,
      device_id: input.deviceId,
      tool_call_id: input.toolCallId,
      tool_id: input.toolId,
      arguments: input.arguments,
      status: "queued",
    }).select("id,task_id,device_id,tool_call_id,tool_id,arguments,status,requested_at").single();
    if (error || !job) return json({ error: "Tool job could not be queued." }, 503);

    if (input.taskId) {
      await admin.from("agent_tasks").update({ status: "waiting_for_device", updated_at: new Date().toISOString() })
        .eq("owner_id", PERSONAL_OWNER_ID).eq("id", input.taskId);
      await admin.from("agent_task_events").insert({
        task_id: input.taskId,
        owner_id: PERSONAL_OWNER_ID,
        event_type: "tool.requested",
        payload: { jobId: job.id, deviceId: input.deviceId, toolId: input.toolId, toolCallId: input.toolCallId },
      });
    }
    return json({ ok: true, job }, 201);
  } catch {
    return json({ error: "Tool job could not be queued." }, 503);
  }
}
