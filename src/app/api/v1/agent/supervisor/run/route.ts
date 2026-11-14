import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { assignSubtasksToAgents, type AssignableAgent } from "@/server/agent/supervisor-orchestrator";
import { createSupervisorPlan } from "@/server/agent/supervisor-service";
import { submitAgentTask } from "@/server/agent/task-service";
import { isValidAgentTaskIdempotencyKey } from "@/server/agent/task-idempotency";
import { safeAgentFailureMessage } from "@/server/agent/failure-diagnostics";
import { readJsonBody } from "@/server/http/read-json";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const parsedBody = await readJsonBody(request, 8000);
  if (!parsedBody.ok) return json({ error: parsedBody.reason === "too_large" ? "Request body too large." : "Invalid JSON body." }, parsedBody.reason === "too_large" ? 413 : 400);
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value) ||
      Object.keys(parsedBody.value).some((key) => key !== "goal")) return json({ error: "Only a goal field is supported." }, 400);
  const goal = (parsedBody.value as Record<string, unknown>).goal;
  if (typeof goal !== "string" || !goal.trim() || goal.trim().length > 4000) return json({ error: "Goal must be between 1 and 4000 characters." }, 400);
  const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
  if (idempotencyKey !== undefined && !isValidAgentTaskIdempotencyKey(idempotencyKey)) return json({ error: "Invalid Idempotency-Key." }, 400);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("agent_definitions")
      .select("id,name,description,role,allowed_tools,enabled")
      .eq("owner_id", PERSONAL_OWNER_ID).eq("enabled", true).limit(100);
    if (error) return json({ error: "Agent registry is unavailable." }, 503);
    const agents: AssignableAgent[] = (data ?? []).map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: typeof agent.description === "string" ? agent.description : "",
      role: typeof agent.role === "string" ? agent.role : "",
      allowedTools: Array.isArray(agent.allowed_tools) ? agent.allowed_tools.filter((item): item is string => typeof item === "string") : [],
      enabled: agent.enabled === true,
    }));
    const planned = await createSupervisorPlan(PERSONAL_OWNER_ID, goal);
    if (!planned.ok) return json({ error: planned.error }, 422);
    const routed = assignSubtasksToAgents(planned.value.subtasks, agents);
    if (!routed.ok) return json({ error: routed.error, plan: planned.value }, 409);

    const members = await Promise.all(routed.assignments.map(async (assignment) => {
      const subtask = planned.value.subtasks.find((item) => item.id === assignment.subtaskId);
      if (!subtask) return { ...assignment, status: "failed", error: "Planned subtask was not found." };
      const childKey = idempotencyKey
        ? createHash("sha256").update(idempotencyKey + ":" + assignment.subtaskId + ":" + assignment.agentId).digest("hex")
        : undefined;
      try {
        const result = await submitAgentTask(subtask.objective, assignment.agentId, childKey, { deferExecution: true });
        return { ...assignment, objective: subtask.objective, taskId: result.taskId, status: result.status };
      } catch (cause) {
        return { ...assignment, objective: subtask.objective, status: "failed", error: safeAgentFailureMessage(cause) };
      }
    }));
    const failed = members.filter((member) => member.status === "failed").length;
    const queued = members.filter((member) => member.status === "queued").length;
    return json({
      status: failed === members.length ? "failed" : failed ? "partial" : "queued",
      goal: planned.value.goal,
      summary: planned.value.summary,
      planner: planned.planner,
      plan: planned.value,
      assignments: members,
      executionMode: "supervisor_planned_capability_routed_parallel_queue",
      limits: { maxSubtasks: 3, workerConcurrency: 3 },
    }, failed === members.length ? 207 : 202);
  } catch {
    return json({ error: "Supervisor could not dispatch this goal. No unverified assignment was reported as successful." }, 503);
  }
}
