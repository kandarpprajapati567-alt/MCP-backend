import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { summarizeAgentTeamMembers } from "@/server/agent/team-run";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ teamRunId: string }> }) {
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
    ? await admin.from("agent_tasks").select("id,status,result,error_code,updated_at,completed_at").eq("owner_id", PERSONAL_OWNER_ID).in("id", taskIds)
    : { data: [], error: null };
  if (childError) return NextResponse.json({ error: "Team member task status is unavailable." }, { status: 503 });
  const childById = new Map((children ?? []).map((child) => [child.id, child]));
  const members = rawMembers.map((member) => {
    const child = typeof member.taskId === "string" ? childById.get(member.taskId) : undefined;
    return {
      subtaskId: member.subtaskId, agentId: member.agentId, agentName: member.agentName,
      objective: member.objective, taskId: member.taskId,
      status: child?.status ?? (typeof member.status === "string" ? member.status : "failed"),
      ...(typeof child?.result === "string" ? { result: child.result } : {}),
      ...(typeof child?.error_code === "string" ? { errorCode: child.error_code } : {}),
      ...(typeof member.error === "string" ? { error: member.error } : {}),
      ...(typeof child?.updated_at === "string" ? { updatedAt: child.updated_at } : {}),
    };
  });
  const summary = summarizeAgentTeamMembers(members);
  let persistedResult = parent.result;
  let persistedStatus = parent.status;
  if (summary.pending === 0 && !parent.result && ["planning", "executing", "completed", "failed"].includes(parent.status)) {
    const now = new Date().toISOString();
    const terminalDbStatus = summary.status === "completed" ? "completed" : "failed";
    persistedResult = JSON.stringify({
      kind: "supervisor_team_rollup",
      method: "deterministic_member_result_aggregation",
      goal: parent.task,
      status: summary.status,
      summary,
      members: members.map((member) => ({ agentId: member.agentId, agentName: member.agentName, subtaskId: member.subtaskId, status: member.status, result: member.result ?? null, error: member.error ?? member.errorCode ?? null })),
      semanticTeamGoalVerification: "not_performed",
    }, null, 2);
    const { data: updated, error: updateError } = await admin.from("agent_tasks").update({
      status: terminalDbStatus, result: persistedResult, completed_at: now, updated_at: now,
    }).eq("owner_id", PERSONAL_OWNER_ID).eq("id", teamRunId).in("status", ["planning", "executing", "completed", "failed"])
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
