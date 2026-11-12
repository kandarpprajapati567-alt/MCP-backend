import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { getCancellationDisposition } from "@/server/agent/task-lifecycle";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  if (!verifyOwnerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const { taskId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId)) {
    return NextResponse.json({ error: "A valid task UUID is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("request_agent_task_cancellation", {
    p_owner_id: PERSONAL_OWNER_ID,
    p_task_id: taskId,
  });
  if (error) {
    return NextResponse.json(
      { error: "Task cancellation is unavailable. Apply the Agent task cancellation migration." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  let disposition: ReturnType<typeof getCancellationDisposition>;
  try {
    disposition = getCancellationDisposition(String(row.status));
  } catch {
    return NextResponse.json({ error: "Task has an unsupported lifecycle state." }, { status: 409 });
  }

  if (disposition === "already_terminal") {
    return NextResponse.json(
      { taskId, status: row.status, cancelled: row.status === "cancelled", message: "Task is already terminal." },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const eventType = disposition === "cancel_now" ? "task.cancelled" : "task.cancellation_requested";
  const { error: eventError } = await admin.from("agent_task_events").insert({
    task_id: taskId,
    owner_id: PERSONAL_OWNER_ID,
    event_type: eventType,
    payload: { source: "owner_api", disposition },
  });
  if (eventError) {
    return NextResponse.json({ error: "Cancellation state changed but its audit event could not be saved." }, { status: 503 });
  }

  return NextResponse.json(
    {
      taskId,
      status: row.status,
      cancelled: row.status === "cancelled",
      cancellationRequested: disposition === "request",
      message: disposition === "request"
        ? "Cancellation requested. The running operation will stop at its next safe checkpoint."
        : "Task cancelled before further execution.",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
