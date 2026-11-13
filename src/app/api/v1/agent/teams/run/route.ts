import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { submitAgentTask } from "@/server/agent/task-service";
import { isValidAgentTaskIdempotencyKey } from "@/server/agent/task-idempotency";
import { safeAgentFailureMessage } from "@/server/agent/failure-diagnostics";
import { verifyOwnerRequest } from "@/server/security/owner-auth";
import { parseAgentTeamRequest } from "@/server/agent/team-schema";
import { readJsonBody } from "@/server/http/read-json";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const parsedBody = await readJsonBody(request, 12000);
  if (!parsedBody.ok) return parsedBody.reason === "too_large"
    ? json({ error: "Request body too large." }, 413)
    : json({ error: "Invalid JSON body." }, 400);

  const parsed = parseAgentTeamRequest(parsedBody.value);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { members: assignments } = parsed.value;

  const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
  if (idempotencyKey !== undefined && !isValidAgentTaskIdempotencyKey(idempotencyKey)) {
    return json({ error: "Idempotency-Key must be 1–128 characters using letters, numbers, dot, underscore, colon or hyphen." }, 400);
  }

  const members = await Promise.all(assignments.map(async (assignment) => {
    const childKey = idempotencyKey
      ? createHash("sha256").update(idempotencyKey + ":" + assignment.agentId).digest("hex")
      : undefined;
    try {
      const result = await submitAgentTask(assignment.task, assignment.agentId, childKey, { deferExecution: true });
      return {
        agentId: assignment.agentId,
        task: assignment.task,
        taskId: result.taskId,
        status: result.status,
        ...("result" in result && typeof result.result === "string" ? { result: result.result } : {}),
        ...("message" in result && typeof result.message === "string" ? { message: result.message } : {}),
        ...("error" in result && typeof result.error === "string" ? { error: result.error } : {}),
      };
    } catch (cause) {
      return {
        agentId: assignment.agentId,
        task: assignment.task,
        status: "failed",
        error: safeAgentFailureMessage(cause),
      };
    }
  }));

  const completed = members.filter((member) => member.status === "completed").length;
  const failed = members.filter((member) => member.status === "failed").length;
  const waiting = members.filter((member) => member.status === "waiting_for_device").length;
  const queued = members.filter((member) => member.status === "queued").length;
  const status = failed === members.length ? "failed"
    : failed > 0 ? "partial"
      : queued === members.length ? "queued"
        : waiting > 0 ? "waiting_for_device"
          : completed === members.length ? "completed" : "running";

  return json({
    status,
    assignments,
    concurrency: members.length,
    summary: { total: members.length, completed, failed, waiting, queued },
    members,
    executionMode: "bounded_parallel_independent_agents",
    note: "Each specialist objective is persisted as an independent task and claimed by the in-process background worker. This is not yet a shared-memory supervisor or dependency-aware delegation graph.",
  }, failed === members.length ? 207 : 200);
}
