import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { assignSubtasksToAgents, type AssignableAgent } from "@/server/agent/supervisor-orchestrator";
import { createSupervisorPlan } from "@/server/agent/supervisor-service";
import { submitAgentTask } from "@/server/agent/task-service";
import { TOOL_CATALOG } from "@/server/tools/registry";
import { createAgentTaskRequestFingerprint, isSameAgentTaskRequest, isValidAgentTaskIdempotencyKey } from "@/server/agent/task-idempotency";
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
    const teamKey = idempotencyKey ? "team:" + createHash("sha256").update(idempotencyKey).digest("hex") : undefined;
    const fingerprint = createAgentTaskRequestFingerprint(goal.trim(), null);
    if (teamKey) {
      const { data: existing, error: existingError } = await admin.from("agent_tasks")
        .select("id,status,request_fingerprint,plan")
        .eq("owner_id", PERSONAL_OWNER_ID).eq("idempotency_key", teamKey).maybeSingle();
      if (existingError) return json({ error: "Team run idempotency is unavailable." }, 503);
      if (existing) {
        if (!isSameAgentTaskRequest(existing.request_fingerprint, fingerprint)) return json({ error: "IDEMPOTENCY_KEY_REUSED" }, 409);
        const existingPlan = existing.plan && typeof existing.plan === "object" ? existing.plan as Record<string, unknown> : {};
        const teamRun = existingPlan.teamRun && typeof existingPlan.teamRun === "object" ? existingPlan.teamRun : null;
        return json({ teamRunId: existing.id, status: existing.status, replayed: true, teamRun, executionMode: "persistent_parallel_team" }, 202);
      }
    }

    const { data, error } = await admin.from("agent_definitions")
      .select("id,name,description,role,allowed_tools,enabled")
      .eq("owner_id", PERSONAL_OWNER_ID).eq("enabled", true).limit(100);
    if (error) return json({ error: "Agent registry is unavailable." }, 503);
    const agents: AssignableAgent[] = (data ?? []).map((agent) => ({
      id: agent.id, name: agent.name,
      description: typeof agent.description === "string" ? agent.description : "",
      role: typeof agent.role === "string" ? agent.role : "",
      allowedTools: Array.isArray(agent.allowed_tools) ? agent.allowed_tools.filter((item): item is string => typeof item === "string") : [],
      enabled: agent.enabled === true,
    }));
    const { data: tavilyConnection } = await admin.from("integration_connections")
      .select("enabled").eq("owner_id", PERSONAL_OWNER_ID).eq("provider", "tavily").eq("enabled", true).maybeSingle();
    const executableToolIds = TOOL_CATALOG
      .filter((tool) => tool.id !== "web.search" || tavilyConnection?.enabled === true)
      .map((tool) => tool.id);
    const planned = await createSupervisorPlan(PERSONAL_OWNER_ID, goal);
    if (!planned.ok) return json({ error: planned.error }, 422);
    const routed = assignSubtasksToAgents(planned.value.subtasks, agents, executableToolIds);
    if (!routed.ok) return json({ error: routed.error, plan: planned.value }, 409);

    const initialPlan = {
      ...planned.value,
      teamRun: {
        version: 1,
        mode: "parallel_independent_specialists",
        members: routed.assignments.map((assignment) => {
          const subtask = planned.value.subtasks.find((item) => item.id === assignment.subtaskId);
          return { ...assignment, objective: subtask?.objective ?? "", status: "planning" };
        }),
      },
    };
    const { data: parent, error: parentError } = await admin.from("agent_tasks").insert({
      owner_id: PERSONAL_OWNER_ID,
      status: "planning",
      task: goal.trim(),
      plan: initialPlan,
      ...(teamKey ? { idempotency_key: teamKey, request_fingerprint: fingerprint } : {}),
    }).select("id").single();
    if (parentError || !parent) {
      if (teamKey && parentError?.code === "23505") return json({ error: "A team run with this idempotency key is already being created. Retry the same request shortly." }, 409);
      return json({ error: "Persistent team run could not be created." }, 503);
    }
    await admin.from("agent_task_events").insert({ task_id: parent.id, owner_id: PERSONAL_OWNER_ID, event_type: "task.created", payload: { kind: "supervisor_team", subtasks: planned.value.subtasks.length } });

    const members = await Promise.all(routed.assignments.map(async (assignment) => {
      const subtask = planned.value.subtasks.find((item) => item.id === assignment.subtaskId);
      if (!subtask) return { ...assignment, objective: "", status: "failed", error: "Planned subtask was not found." };
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

    const storedPlan = { ...planned.value, teamRun: { version: 1, mode: "parallel_independent_specialists", members } };
    const parentStatus = members.every((member) => member.status === "completed") ? "completed" : "executing";
    const now = new Date().toISOString();
    const { error: updateError } = await admin.from("agent_tasks").update({
      plan: storedPlan, status: parentStatus, updated_at: now,
      ...(parentStatus === "completed" ? { completed_at: now } : {}),
    }).eq("owner_id", PERSONAL_OWNER_ID).eq("id", parent.id);
    if (updateError) return json({ error: "Team tasks were queued, but their parent run record could not be updated. Check Agent Task History." }, 503);
    await admin.from("agent_task_events").insert({ task_id: parent.id, owner_id: PERSONAL_OWNER_ID, event_type: "task.plan_ready", payload: { teamRunId: parent.id, assignments: members.length } });
    await admin.from("agent_task_events").insert({ task_id: parent.id, owner_id: PERSONAL_OWNER_ID, event_type: "task.executing", payload: { status: parentStatus } });

    const completed = members.filter((member) => member.status === "completed").length;
    return json({
      teamRunId: parent.id,
      status: completed === members.length ? "completed" : "queued",
      goal: planned.value.goal, summary: planned.value.summary, planner: planned.planner,
      plan: planned.value, assignments: members,
      executionMode: "supervisor_planned_capability_routed_parallel_queue",
      limits: { maxSubtasks: 3, workerConcurrency: 3 },
    }, completed === members.length ? 200 : 202);
  } catch (cause) {
    const diagnostic = safeAgentFailureMessage(cause);
    console.error("[supervisor] Dispatch failed:", diagnostic);
    return json({ error: diagnostic, code: "SUPERVISOR_DISPATCH_FAILED", message: "No unverified assignment was reported as successful. Review the Agent registry and server diagnostics, then retry." }, 503);
  }
}
