import { NextResponse } from "next/server";
import { verifyOwnerRequest } from "@/server/security/owner-auth";
import { retryAgentTask } from "@/server/agent/task-service";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

const retryMessages: Record<string, string> = {
  TASK_RETRY_NOT_FAILED: "Only a failed task can be retried.",
  TASK_RETRY_CANCELLED: "A cancelled task cannot be retried.",
  TASK_RETRY_UNSAFE_FAILURE: "This failure did not occur in the safe planning-only stage.",
  TASK_RETRY_PLAN_ALREADY_CREATED: "A plan already exists; replay is blocked to avoid repeating work.",
  TASK_RETRY_TOOL_RESULTS_PRESENT: "Tool results already exist; replay is blocked.",
  TASK_RETRY_TOOL_ACTIVITY_PRESENT: "Tool activity was recorded; replay is blocked to avoid repeating side effects.",
  TASK_RETRY_DEVICE_JOB_PRESENT: "A device job exists; replay is blocked.",
  TASK_RETRY_RETRY_IN_PROGRESS: "A retry attempt is already in progress.",
  TASK_RETRY_STALE_ATTEMPT: "Retry the latest task attempt, not an older attempt.",
  TASK_RETRY_MAX_RETRIES: "The maximum of two safe retries has been reached.",
  TASK_RETRY_INVALID_RETRY_COUNT: "Retry history is invalid; retry was refused.",
  TASK_RETRY_AGENT_SNAPSHOT_INVALID: "The original Agent configuration snapshot is invalid; retry was refused.",
};

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const { taskId } = await context.params;
  try {
    const result = await retryAgentTask(taskId);
    if (!result) return json({ error: "Task not found." }, 404);
    return json(result, result.replayed ? 200 : 202);
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "TASK_RETRY_UNAVAILABLE";
    if (code === "INVALID_TASK_ID") return json({ error: "A valid task UUID is required." }, 400);
    if (code === "TASK_RETRY_UNAVAILABLE") return json({ error: "Task retry data is temporarily unavailable. No retry was queued." }, 503);
    return json({ error: retryMessages[code] ?? "This task is not eligible for a safe retry.", code }, 409);
  }
}
