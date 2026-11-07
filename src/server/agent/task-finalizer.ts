import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { executeUserWorkflow } from "@/server/ai/routing/runtime-executor";
import { PERSONAL_OWNER_ID } from "@/server/security/owner-auth";

export async function finalizeAgentTaskIfReady(taskId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: task, error: taskError } = await admin.from("agent_tasks")
    .select("id,status,task,plan,tool_results")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .eq("id", taskId)
    .maybeSingle();
  if (taskError) throw new Error("Task state could not be loaded.");
  if (!task || task.status !== "waiting_for_device") return false;

  const { data: jobs, error: jobsError } = await admin.from("agent_tool_jobs")
    .select("id,device_id,tool_call_id,tool_id,status,result,error_code")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .eq("task_id", taskId);
  if (jobsError) throw new Error("Device tool results could not be loaded.");
  if (!jobs?.length || jobs.some((job) => !["completed", "failed", "cancelled", "expired"].includes(job.status))) {
    return false;
  }

  const { data: claimed, error: claimError } = await admin.from("agent_tasks").update({
    status: "synthesizing",
    updated_at: new Date().toISOString(),
  }).eq("owner_id", PERSONAL_OWNER_ID)
    .eq("id", taskId)
    .eq("status", "waiting_for_device")
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error("Task synthesis could not be started.");
  if (!claimed) return false;

  const localResults = Array.isArray(task.tool_results) ? task.tool_results : [];
  const deviceResults = jobs.map((job) => ({
    callId: job.tool_call_id,
    toolId: job.tool_id,
    deviceId: job.device_id,
    status: job.status,
    result: job.result,
    ...(job.error_code ? { errorCode: job.error_code } : {}),
  }));
  const toolResults = [...localResults, ...deviceResults];

  await admin.from("agent_task_events").insert({
    task_id: taskId,
    owner_id: PERSONAL_OWNER_ID,
    event_type: "task.synthesizing",
    payload: { deviceJobs: jobs.length },
  });

  let result: string;
  try {
    const synthesis = await executeUserWorkflow(PERSONAL_OWNER_ID, "summarization", {
      messages: [
        { role: "system", content: "Synthesize the task outcome using only the task, plan and verified local/device tool results. Clearly report failed device operations. Never claim unperformed actions." },
        { role: "user", content: JSON.stringify({ task: task.task, plan: task.plan, toolResults }) },
      ],
      temperature: 0.2,
      maxOutputTokens: 1400,
    });
    result = synthesis.route.providerId === "mock"
      ? "Device execution finished. AI synthesis is not configured yet.\n" + JSON.stringify(toolResults, null, 2)
      : synthesis.result.text;
  } catch {
    result = "Device execution finished, but AI synthesis was unavailable. Verified results:\n" + JSON.stringify(toolResults, null, 2);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin.from("agent_tasks").update({
    status: "completed",
    tool_results: toolResults,
    result,
    completed_at: now,
    updated_at: now,
  }).eq("owner_id", PERSONAL_OWNER_ID).eq("id", taskId);
  if (updateError) throw new Error("Task completion could not be saved.");

  await admin.from("agent_task_events").insert({
    task_id: taskId,
    owner_id: PERSONAL_OWNER_ID,
    event_type: "task.completed",
    payload: { toolResults: toolResults.length },
  });
  return true;
}
