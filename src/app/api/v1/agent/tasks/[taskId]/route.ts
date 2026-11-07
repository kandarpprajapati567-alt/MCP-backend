import { NextResponse } from "next/server";
import { verifyOwnerRequest } from "@/server/security/owner-auth";
import { getAgentTaskStatus } from "@/server/agent/task-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ taskId: string }> }) {
  if (!verifyOwnerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const { taskId } = await context.params;
  try {
    const status = await getAgentTaskStatus(taskId);
    if (!status) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    return NextResponse.json(status, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unable to load task.";
    return NextResponse.json({ error: message }, { status: message.includes("UUID") ? 400 : 503 });
  }
}
