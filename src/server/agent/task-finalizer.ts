import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { executeAgentWorkflow, executeUserWorkflow } from "@/server/ai/routing/runtime-executor";
import { AGENT_PROVIDERS, type AgentProviderPreference } from "@/server/agent/definition-schema";
import { safeAgentFailureMessage } from "@/server/agent/failure-diagnostics";
import { buildSynthesisSystemPrompt, buildSynthesisUserContent } from "@/server/agent/synthesis-context";
import { guardSynthesisAnswer } from "@/server/agent/evidence-guard";
import { PERSONAL_OWNER_ID } from "@/server/security/owner-auth";
import type { AIGenerationRequest } from "@/server/ai/providers/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const STALE_SYNTHESIS_MS = 5 * 60 * 1000;

export async function finalizeAgentTaskIfReady(taskId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: task, error: taskError } = await admin.from("agent_tasks")
    .select("id,status,task,plan,tool_results,updated_at")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .eq("id", taskId)
    .maybeSingle();
  if (taskError) throw new Error("Task state could not be loaded.");
  if (!task) return false;

  const staleCutoff = new Date(Date.now() - STALE_SYNTHESIS_MS).toISOString();
  const waiting = task.status === "waiting_for_device";
  const staleSynthesis = task.status === "synthesizing" &&
    typeof task.updated_at === "string" &&
    Number.isFinite(Date.parse(task.updated_at)) &&
    Date.parse(task.updated_at) < Date.now() - STALE_SYNTHESIS_MS;
  if (!waiting && !staleSynthesis) return false;

  const { data: snapshotRow, error: snapshotError } = await admin.from("agent_tasks")
    .select("agent_snapshot").eq("owner_id", PERSONAL_OWNER_ID).eq("id", taskId).maybeSingle();
  if (snapshotError) throw new Error("Agent execution snapshot could not be loaded.");
  const agentSnapshot: unknown = snapshotRow?.agent_snapshot ?? null;

  const { data: jobs, error: jobsError } = await admin.from("agent_tool_jobs")
    .select("id,device_id,tool_call_id,tool_id,status,result,error_code")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .eq("task_id", taskId);
  if (jobsError) throw new Error("Device tool results could not be loaded.");
  if (!jobs?.length || jobs.some((job) => !["completed", "failed", "cancelled", "expired"].includes(job.status))) {
    return false;
  }

  let claimQuery = admin.from("agent_tasks").update({
    status: "synthesizing",
    updated_at: new Date().toISOString(),
  }).eq("owner_id", PERSONAL_OWNER_ID).eq("id", taskId);
  claimQuery = waiting
    ? claimQuery.eq("status", "waiting_for_device")
    : claimQuery.eq("status", "synthesizing").lt("updated_at", staleCutoff);
  const { data: claimed, error: claimError } = await claimQuery.select("id").maybeSingle();
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

  const { error: startedEventError } = await admin.from("agent_task_events").insert({
    task_id: taskId,
    owner_id: PERSONAL_OWNER_ID,
    event_type: "task.synthesizing",
    payload: { deviceJobs: jobs.length, recovery: staleSynthesis },
  });
  if (startedEventError) {
    await admin.from("agent_tasks").update({
      status: "failed",
      error_code: "TASK_EVENT_PERSISTENCE_FAILED",
      updated_at: new Date().toISOString(),
    }).eq("owner_id", PERSONAL_OWNER_ID).eq("id", taskId).eq("status", "synthesizing");
    throw new Error("Task execution event could not be persisted.");
  }

  const snapshot = isRecord(agentSnapshot) ? agentSnapshot : null;
  const providerPreference = snapshot && typeof snapshot.providerPreference === "string" &&
    AGENT_PROVIDERS.includes(snapshot.providerPreference as AgentProviderPreference)
    ? snapshot.providerPreference as AgentProviderPreference : "auto";
  const modelPreference = snapshot && typeof snapshot.modelPreference === "string"
    ? snapshot.modelPreference : null;
  const systemPrompt = buildSynthesisSystemPrompt(
    snapshot && typeof snapshot.role === "string" ? snapshot.role : undefined,
    snapshot && typeof snapshot.instructions === "string" ? snapshot.instructions : undefined,
  ) + " Clearly report failed device operations. Evidence and tool execution results remain authoritative.";

  let result: string;
  try {
    const synthesisRequest: AIGenerationRequest = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildSynthesisUserContent(String(task.task ?? ""), task.plan, toolResults) },
      ],
      temperature: 0.2,
      maxOutputTokens: 1400,
    };
    const synthesis = snapshot
      ? await executeAgentWorkflow(PERSONAL_OWNER_ID, "summarization", synthesisRequest, {
          providerPreference,
          modelPreference,
        })
      : await executeUserWorkflow(PERSONAL_OWNER_ID, "summarization", synthesisRequest);
    result = synthesis.route.providerId === "mock"
      ? "AI synthesis unavailable. No model-generated conclusion was produced. Raw device tool outcomes follow; they are observations and are not independently verified.\n" + JSON.stringify(toolResults, null, 2)
      : guardSynthesisAnswer(synthesis.result.text, toolResults);
  } catch (error) {
    const message = safeAgentFailureMessage(error);
    const now = new Date().toISOString();
    const { error: failureUpdateError } = await admin.from("agent_tasks").update({
      status: "failed",
      tool_results: toolResults,
      error_code: "AGENT_SYNTHESIS_FAILED",
      updated_at: now,
    }).eq("owner_id", PERSONAL_OWNER_ID).eq("id", taskId).eq("status", "synthesizing");
    if (failureUpdateError) throw new Error("Task synthesis failed and its failure state could not be saved.");
    await admin.from("agent_task_events").insert({
      task_id: taskId,
      owner_id: PERSONAL_OWNER_ID,
      event_type: "task.failed",
      payload: { code: "AGENT_SYNTHESIS_FAILED", stage: "synthesis", message },
    });
    return true;
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin.from("agent_tasks").update({
    status: "completed",
    tool_results: toolResults,
    result,
    completed_at: now,
    updated_at: now,
  }).eq("owner_id", PERSONAL_OWNER_ID).eq("id", taskId).eq("status", "synthesizing");
  if (updateError) throw new Error("Task completion could not be saved.");

  const { error: completedEventError } = await admin.from("agent_task_events").insert({
    task_id: taskId,
    owner_id: PERSONAL_OWNER_ID,
    event_type: "task.completed",
    payload: { toolResults: toolResults.length },
  });
  if (completedEventError) {
    await admin.from("agent_tasks").update({
      error_code: "TASK_EVENT_PERSISTENCE_FAILED",
      updated_at: new Date().toISOString(),
    }).eq("owner_id", PERSONAL_OWNER_ID).eq("id", taskId).eq("status", "completed");
  }
  return true;
}
