import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { submitAgentTask } from "@/server/agent/task-service";
import { isValidAgentTaskIdempotencyKey } from "@/server/agent/task-idempotency";
import { safeAgentFailureMessage } from "@/server/agent/failure-diagnostics";
import { verifyOwnerRequest } from "@/server/security/owner-auth";
import { readJsonBody } from "@/server/http/read-json";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const MAX_TEAM_SIZE = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const parsedBody = await readJsonBody(request, 12000);
  if (!parsedBody.ok) return parsedBody.reason === "too_large"
    ? json({ error: "Request body too large." }, 413)
    : json({ error: "Invalid JSON body." }, 400);

  const body = parsedBody.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "A JSON object is required." }, 400);
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "task" && key !== "agentIds")) {
    return json({ error: "Team request contains unsupported fields." }, 400);
  }
  if (typeof input.task !== "string" || !input.task.trim() || input.task.length > 4000) {
    return json({ error: "Task must be 1–4000 characters." }, 400);
  }
  if (!Array.isArray(input.agentIds) || input.agentIds.length < 2 || input.agentIds.length > MAX_TEAM_SIZE ||
      input.agentIds.some((id) => typeof id !== "string" || !UUID.test(id)) ||
      new Set(input.agentIds).size !== input.agentIds.length) {
    return json({ error: "Choose 2 or 3 different valid Agent IDs." }, 400);
  }

  const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
  if (idempotencyKey !== undefined && !isValidAgentTaskIdempotencyKey(idempotencyKey)) {
    return json({ error: "Idempotency-Key must be 1–128 characters using letters, numbers, dot, underscore, colon or hyphen." }, 400);
  }

  const agentIds = input.agentIds as string[];
  const members = await Promise.all(agentIds.map(async (agentId) => {
    const childKey = idempotencyKey
      ? createHash("sha256").update(idempotencyKey + ":" + agentId).digest("hex")
      : undefined;
    try {
      const result = await submitAgentTask(input.task as string, agentId, childKey);
      return {
        agentId,
        taskId: result.taskId,
        status: result.status,
        ...(typeof result.result === "string" ? { result: result.result } : {}),
        ...(typeof result.message === "string" ? { message: result.message } : {}),
        ...(typeof result.error === "string" ? { error: result.error } : {}),
      };
    } catch (cause) {
      return {
        agentId,
        status: "failed",
        error: safeAgentFailureMessage(cause),
      };
    }
  }));

  const completed = members.filter((member) => member.status === "completed").length;
  const failed = members.filter((member) => member.status === "failed").length;
  const waiting = members.filter((member) => member.status === "waiting_for_device").length;
  const status = failed === members.length ? "failed"
    : failed > 0 ? "partial"
      : waiting > 0 ? "waiting_for_device"
        : completed === members.length ? "completed" : "running";

  return json({
    status,
    task: input.task,
    concurrency: members.length,
    summary: { total: members.length, completed, failed, waiting },
    members,
    executionMode: "bounded_parallel_independent_agents",
    note: "Each Agent ran its own policy-checked task. This is parallel specialist execution, not yet a durable background team coordinator.",
  }, failed === members.length ? 207 : 200);
}
