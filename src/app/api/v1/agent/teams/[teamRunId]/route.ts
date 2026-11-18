import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { summarizeAgentTeamMembers } from "@/server/agent/team-run";
import { evaluateAgentCompletion } from "@/server/agent/completion-evaluator";
import { evaluateAgentGoalCriteria } from "@/server/agent/goal-evaluator";
import type { AgentPlan } from "@/shared/agent/contracts";
import type { SynthesisToolResult } from "@/server/agent/synthesis-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ teamRunId: string }> }) {
  if (!verifyOwnerRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { teamRunId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(teamRunId)) {
    return NextResponse.json({ error: "A valid team run ID is required." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: parent, error } = await admin.from("agent_tasks")
    .select("id,status,task,plan,result,error_code,created_at,updated_at,completed_at")
    .eq("owner_id", PERSONAL_OWNER_ID).eq("id", teamRunId).maybeSingle();
  if (error) return NextResponse.json({ error: "Team run status is unavailable." }, { status: 503 });
  if (!parent) return NextResponse.json({ error: "Team run not found." }, { status: 404 });
  const plan = parent.plan && typeof parent.plan === "object" ? parent.plan as Record<string, unknown> : {};
  const teamRun = plan.teamRun && typeof plan.teamRun === "object" ? plan.teamRun as Record<string, unknown> : null;
  const rawMembers = teamRun && Array.isArray(teamRun.members) ? teamRun.members as Array<Record<string, unknown>> : [];
  const taskIds = rawMembers.flatMap((member) => typeof member.taskId === "string" ? [member.taskId] : []);
  const { data: children, error: childError } = taskIds.length
    ? await admin.from("agent_tasks").select("id,status,plan,tool_results,result,error_code,updated_at,completed_at").eq("owner_id", PERSONAL_OWNER_ID).in("id", taskIds)
    : { data: [], error: null };
  if (childError) return NextResponse.json({ error: "Team member task status is unavailable." }, { status: 503 });
  const childById = new Map((children ?? []).map((child) => [child.id, child]));
  const members = rawMembers.map((member) => {
    const child = typeof member.taskId === "string" ? childById.get(member.taskId) : undefined;
    const toolResults = Array.isArray(child?.tool_results)
      ? child.tool_results.filter((item): item is SynthesisToolResult =>
          Boolean(item && typeof item === "object" && !Array.isArray(item) &&
            typeof (item as Record<string, unknown>).callId === "string" &&
            typeof (item as Record<string, unknown>).toolId === "string" &&
            "result" in (item as Record<string, unknown>)))
      : [];
    const rawChildPlan = child?.plan && typeof child.plan === "object" && !Array.isArray(child.plan)
      ? child.plan as Record<string, unknown> : null;
    const childPlan = rawChildPlan && typeof rawChildPlan.goal === "string" &&
      Array.isArray(rawChildPlan.steps) && Array.isArray(rawChildPlan.toolCalls)
      ? rawChildPlan as unknown as AgentPlan : null;
    const childResult = typeof child?.result === "string" ? child.result : "";
    const answer = childResult.split("\\n\\nCOMPLETION EVALUATION\\n")[0];
    const completionEvaluation = childPlan
      ? evaluateAgentCompletion(childPlan, toolResults, answer)
      : null;
    const goalEvaluation = childPlan
      ? evaluateAgentGoalCriteria(childPlan, toolResults, answer)
      : null;
    return {
      subtaskId: member.subtaskId, agentId: member.agentId, agentName: member.agentName,
      objective: member.objective, taskId: member.taskId,
      status: child?.status ?? (typeof member.status === "string" ? member.status : "failed"),
      evidenceCount: toolResults.length,
      ...(completionEvaluation ? { completionEvaluation, completionVerdict: completionEvaluation.verdict } : {}),
      ...(goalEvaluation ? { goalEvaluation, goalVerdict: goalEvaluation.verdict } : {}),
      ...(childResult ? { result: childResult } : {}),
      ...(typeof child?.error_code === "string" ? { errorCode: child.error_code } : {}),
      ...(typeof member.error === "string" ? { error: member.error } : {}),
      ...(typeof child?.updated_at === "string" ? { updatedAt: child.updated_at } : {}),
    };
  });
  const summary = summarizeAgentTeamMembers(members);
  let persistedResult = parent.result;
  let persistedStatus = parent.status;
  if (summary.pending === 0 && ["planning", "executing", "completed", "failed"].includes(parent.status) &&
      (!parent.result || (parent.status === "completed" && summary.status !== "completed") ||
        (parent.status !== "completed" && summary.status === "completed"))) {
    const now = new Date().toISOString();
    const terminalDbStatus = summary.status === "completed" ? "completed" : "failed";
    persistedResult = JSON.stringify({
      kind: "supervisor_team_rollup",
      method: "deterministic_member_result_aggregation",
      goal: parent.task,
      status: summary.status,
      summary,
      members: members.map((member) => ({
        agentId: member.agentId, agentName: member.agentName, subtaskId: member.subtaskId,
        status: member.status, completionVerdict: member.completionVerdict ?? null,
        goalVerdict: member.goalVerdict ?? null, evidenceCount: member.evidenceCount ?? 0,
        result: member.result ?? null, error: member.error ?? member.errorCode ?? null,
      })),
      semanticTeamGoalVerification: "not_performed",
    }, null, 2);
    const { data: updated, error: updateError } = await admin.from("agent_tasks").update({
      status: terminalDbStatus, result: persistedResult, completed_at: now, updated_at: now,
    }).eq("owner_id", PERSONAL_OWNER_ID).eq("id", teamRunId).eq("status", parent.status)
      .select("status,result").maybeSingle();
    if (updateError) return NextResponse.json({ error: "Team run finalization could not be saved." }, { status: 503 });
    if (updated) {
      persistedStatus = updated.status;
      persistedResult = updated.result;
      await admin.from("agent_task_events").insert({
        task_id: teamRunId, owner_id: PERSONAL_OWNER_ID,
        event_type: terminalDbStatus === "completed" ? "task.completed" : "task.failed",
        payload: { teamStatus: summary.status, ...summary, method: "deterministic_member_result_aggregation" },
      });
    } else {
      const { data: latest } = await admin.from("agent_tasks").select("status,result").eq("owner_id", PERSONAL_OWNER_ID).eq("id", teamRunId).maybeSingle();
      if (latest) { persistedStatus = latest.status; persistedResult = latest.result; }
    }
  }
  return NextResponse.json({
    teamRunId, status: summary.status, summary, goal: parent.task,
    members, result: persistedResult, persistedStatus,
    executionMode: "parallel_independent_specialists",
    semanticTeamGoalVerification: "not_performed",
  }, { headers: { "Cache-Control": "private, no-store" } });
}
