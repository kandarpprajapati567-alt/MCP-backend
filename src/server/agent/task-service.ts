import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID } from "@/server/security/owner-auth";
import { createAgentPlan, type AvailableDeviceTool } from "@/server/agent/planner";
import { buildLocalAgentPlan } from "@/server/agent/local-plan";
import { parseAgentDefinition, type AgentDefinitionInput } from "@/server/agent/definition-schema";
import { executeAgentWorkflow } from "@/server/ai/routing/runtime-executor";
import { executeBackendTool } from "@/server/tools/executor";
import { executeUserWorkflow } from "@/server/ai/routing/runtime-executor";
import type { AIGenerationRequest } from "@/server/ai/providers/types";
import { safeAgentFailureMessage } from "@/server/agent/failure-diagnostics";
import { executeToolCallsSequentially, executeToolCallsWithConcurrency, type ToolCallExecution } from "@/server/agent/tool-call-execution";
import { TOOL_CATALOG } from "@/server/tools/registry";
import { finalizeAgentTaskIfReady } from "@/server/agent/task-finalizer";
import { buildSynthesisSystemPrompt, buildSynthesisUserContent } from "@/server/agent/synthesis-context";
import { guardSynthesisAnswer } from "@/server/agent/evidence-guard";
import { createAgentTaskRequestFingerprint, isSameAgentTaskRequest } from "@/server/agent/task-idempotency";
import { AgentTaskCancelledError, isAgentTaskCancellationRequested } from "@/server/agent/task-lifecycle";
import {
  AgentTaskBudgetExceededError,
  assertAgentTaskPlanWithinBudget,
  assertAgentTaskTimeBudget,
  assertAgentTaskToolResultWithinBudget,
  getAgentTaskJsonByteLength,
  resolveAgentTaskBudget,
} from "@/server/agent/task-budget";
import {
  AGENT_TASK_RETRY_PREFIX,
  createAgentTaskRetryKey,
  evaluateSafeAgentTaskRetry,
  MAX_AGENT_TASK_RETRIES,
  parseAgentTaskRetryKey,
} from "@/server/agent/task-retry-policy";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function event(admin: ReturnType<typeof createAdminClient>, taskId: string, eventType: string, payload: Record<string, unknown> = {}) {
  const { error } = await admin.from("agent_task_events").insert({ task_id: taskId, owner_id: PERSONAL_OWNER_ID, event_type: eventType, payload });
  if (error) throw new Error("Unable to persist task event.");
}

async function setTask(admin: ReturnType<typeof createAdminClient>, id: string, patch: Record<string, unknown>) {
  const { error } = await admin.from("agent_tasks").update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id).eq("owner_id", PERSONAL_OWNER_ID);
  if (error) throw new Error("Unable to update task.");
}

async function assertTaskNotCancelled(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data, error } = await admin.from("agent_tasks")
    .select("status,cancellation_requested_at")
    .eq("id", id).eq("owner_id", PERSONAL_OWNER_ID).maybeSingle();
  if (error || !data) throw new Error("Task lifecycle state is unavailable.");
  if (data.status === "cancelled" || isAgentTaskCancellationRequested(data.cancellation_requested_at)) {
    throw new AgentTaskCancelledError();
  }
}

async function loadAgentDefinition(
  admin: ReturnType<typeof createAdminClient>,
  agentId: string,
): Promise<{ id: string } & AgentDefinitionInput> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(agentId)) {
    throw new Error("A valid agent ID is required.");
  }
  const { data, error } = await admin.from("agent_definitions")
    .select("id,name,description,role,instructions,provider_preference,model_preference,allowed_tools,max_steps,max_tool_calls,enabled")
    .eq("owner_id", PERSONAL_OWNER_ID).eq("id", agentId).maybeSingle();
  if (error) throw new Error("Agent definitions are unavailable. Apply the Agent Manager migration before selecting an Agent.");
  if (!data) throw new Error("The selected Agent does not exist.");
  const parsed = parseAgentDefinition({
    name: data.name,
    description: data.description,
    role: data.role,
    instructions: data.instructions,
    providerPreference: data.provider_preference,
    modelPreference: data.model_preference,
    allowedTools: data.allowed_tools,
    maxSteps: data.max_steps,
    maxToolCalls: data.max_tool_calls,
    enabled: data.enabled,
  });
  if (!parsed.ok) throw new Error("The selected Agent definition is invalid.");
  if (!parsed.value.enabled) throw new Error("The selected Agent is disabled.");
  return { id: data.id, ...parsed.value };
}

async function getAvailableDeviceTools(admin: ReturnType<typeof createAdminClient>): Promise<AvailableDeviceTool[]> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await admin.from("agent_devices").select("device_id,capabilities")
    .eq("owner_id", PERSONAL_OWNER_ID).eq("status", "online").gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false });
  if (error) throw new Error("Device capabilities could not be loaded.");

  const tools: AvailableDeviceTool[] = [];
  const seen = new Set<string>();
  for (const device of data ?? []) {
    const capabilities = Array.isArray(device.capabilities) ? device.capabilities : [];
    for (const raw of capabilities) {
      if (!isRecord(raw) || typeof raw.id !== "string" || seen.has(raw.id) ||
          typeof raw.description !== "string" || typeof raw.permission !== "string" ||
          typeof raw.sideEffect !== "boolean" || !isRecord(raw.inputSchema) ||
          raw.inputSchema.type !== "object" || !isRecord(raw.inputSchema.properties)) continue;
      tools.push({
        id: raw.id,
        description: raw.description.slice(0, 500),
        permission: raw.permission,
        sideEffect: raw.sideEffect,
        deviceId: device.device_id,
        inputSchema: {
          type: "object",
          properties: raw.inputSchema.properties,
          required: Array.isArray(raw.inputSchema.required)
            ? raw.inputSchema.required.filter((item): item is string => typeof item === "string")
            : [],
          additionalProperties: false,
        },
      });
      seen.add(raw.id);
    }
  }
  return tools.slice(0, 40);
}

async function executeAgentTaskRecord(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  task: string,
  agent: ({ id: string } & AgentDefinitionInput) | null,
  retryInfo?: { rootTaskId: string; attempt: number },
) {
  const budget = resolveAgentTaskBudget(agent ?? undefined);
  const startedAt = Date.now();
  let totalToolResultBytes = 0;
  let toolResultBudgetExceeded = false;
  const heartbeat = setInterval(() => {
    void (async () => {
      try {
        const { error } = await admin.from("agent_tasks").update({ updated_at: new Date().toISOString() })
          .eq("id", id).eq("owner_id", PERSONAL_OWNER_ID)
          .in("status", ["planning", "executing", "synthesizing"]);
        if (error) console.warn("[agent-worker] Heartbeat update failed for task", id);
      } catch {
        console.warn("[agent-worker] Heartbeat request failed for task", id);
      }
    })();
  }, 30_000);
  let failedStage: "planning" | "policy_validation" | "tool_execution" | "synthesis" | "finalization" = "planning";

  try {
    await event(admin, id, "task.created", retryInfo
      ? { retryOf: retryInfo.rootTaskId, attempt: retryInfo.attempt, retryPolicy: "planning-only" }
      : {});
    await assertTaskNotCancelled(admin, id);
    await setTask(admin, id, { status: "planning" });
    await assertTaskNotCancelled(admin, id);
    await event(admin, id, "task.planning");

    const deviceTools = await getAvailableDeviceTools(admin);
    const planned = agent
      ? await createAgentPlan(PERSONAL_OWNER_ID, task, deviceTools, agent)
      : await createAgentPlan(PERSONAL_OWNER_ID, task, deviceTools);
    const plan = planned ?? buildLocalAgentPlan(task, agent ?? undefined);
    await assertTaskNotCancelled(admin, id);
    failedStage = "policy_validation";
    assertAgentTaskPlanWithinBudget(plan, budget);
    if (agent && plan.toolCalls.some((call) => !agent.allowedTools.includes(call.toolId))) {
      throw new Error("Agent execution policy rejected the generated plan.");
    }
    await setTask(admin, id, { plan, status: "executing" });
    await event(admin, id, "task.plan_ready", {
      steps: plan.steps.length,
      toolCalls: plan.toolCalls.length,
      deviceToolsAvailable: deviceTools.length,
      planner: planned ? "configured-workflow-policy" : "local-safe-planner",
      budget: {
        maxSteps: budget.maxSteps,
        maxToolCalls: budget.maxToolCalls,
        maxExecutionMs: budget.maxExecutionMs,
        maxToolResultBytes: budget.maxToolResultBytes,
        maxTotalToolResultBytes: budget.maxTotalToolResultBytes,
        maxSynthesisTokens: budget.maxSynthesisTokens,
      },
      ...(agent ? { agentId: agent.id, agentName: agent.name, maxSteps: agent.maxSteps, maxToolCalls: agent.maxToolCalls } : {}),
    });
    await event(admin, id, "task.executing");

    const results: Array<{ callId: string; toolId: string; result: unknown }> = [];
    const pendingJobs: Array<{ id: string; deviceId: string; toolId: string }> = [];
    failedStage = "tool_execution";
    const executeCall = async (call: typeof plan.toolCalls[number]) => {
      const deviceTool = deviceTools.find((tool) => tool.id === call.toolId);
      if (deviceTool) {
        const { data: job, error } = await admin.from("agent_tool_jobs").insert({
          owner_id: PERSONAL_OWNER_ID, task_id: id, device_id: deviceTool.deviceId,
          tool_call_id: call.id, tool_id: call.toolId, arguments: call.arguments, status: "queued",
        }).select("id,device_id,tool_id").single();
        if (error || !job) throw new Error("Device tool job could not be queued.");
        pendingJobs.push({ id: job.id, deviceId: job.device_id, toolId: job.tool_id });
        await event(admin, id, "tool.requested", { jobId: job.id, deviceId: job.device_id, toolId: job.tool_id, toolCallId: call.id });
        return { queuedForDevice: true };
      }
      return executeBackendTool(call.toolId, call.arguments);
    };
    const shouldCaptureFailure = (call: typeof plan.toolCalls[number]) => !deviceTools.some((tool) => tool.id === call.toolId);
    const persistOutcome = async (call: typeof plan.toolCalls[number], execution: ToolCallExecution) => {
      if (deviceTools.some((tool) => tool.id === call.toolId)) return;
      if (toolResultBudgetExceeded) {
        results.push({ callId: call.id, toolId: call.toolId, result: { ok: false, error: "Task result budget was exhausted before this output could be retained." } });
        await setTask(admin, id, { tool_results: results });
        await event(admin, id, "tool.failed", { callId: call.id, toolId: call.toolId, message: "Task result budget was exhausted." });
        return;
      }
      const value = execution.ok ? execution.result : { ok: false, error: execution.error };
      try {
        const bytes = getAgentTaskJsonByteLength(value);
        assertAgentTaskToolResultWithinBudget(bytes, totalToolResultBytes, budget);
        totalToolResultBytes += bytes;
        results.push({ callId: call.id, toolId: call.toolId, result: value });
        await setTask(admin, id, { tool_results: results });
        if (execution.ok) await event(admin, id, "tool.completed", { callId: call.id, toolId: call.toolId });
        else await event(admin, id, "tool.failed", { callId: call.id, toolId: call.toolId, message: execution.error });
      } catch (cause) {
        if (!(cause instanceof AgentTaskBudgetExceededError)) throw cause;
        toolResultBudgetExceeded = true;
        results.push({ callId: call.id, toolId: call.toolId, result: { ok: false, error: "Tool output exceeded the configured task result budget." } });
        await setTask(admin, id, { tool_results: results });
        await event(admin, id, "tool.failed", { callId: call.id, toolId: call.toolId, message: "Tool output exceeded the configured task result budget." });
      }
    };
    const beforeEach = async () => {
      await assertTaskNotCancelled(admin, id);
      if (toolResultBudgetExceeded) throw new AgentTaskBudgetExceededError("tool results");
      assertAgentTaskTimeBudget(startedAt, Date.now(), budget);
    };
    const parallelSafeIds = new Set<string>(TOOL_CATALOG.filter((tool) => tool.annotations.readOnlyHint && tool.annotations.idempotentHint && !tool.sideEffect).map((tool) => tool.id));
    const canRunInParallel = plan.toolCalls.length > 1 && plan.toolCalls.every((call) => parallelSafeIds.has(call.toolId) && !deviceTools.some((tool) => tool.id === call.toolId));
    if (canRunInParallel) await executeToolCallsWithConcurrency(plan.toolCalls, executeCall, 3, shouldCaptureFailure, persistOutcome, beforeEach);
    else await executeToolCallsSequentially(plan.toolCalls, executeCall, shouldCaptureFailure, persistOutcome, beforeEach);

    if (toolResultBudgetExceeded) throw new AgentTaskBudgetExceededError("tool results");
    if (results.some((item) => isRecord(item.result) && item.result.ok === false)) {
      throw new Error("One or more registered tool calls failed.");
    }

    await assertTaskNotCancelled(admin, id);
    if (pendingJobs.length) {
      await assertTaskNotCancelled(admin, id);
      await setTask(admin, id, { status: "waiting_for_device", tool_results: results });
      try { await finalizeAgentTaskIfReady(id); } catch { /* A later device callback can retry finalization. */ }
      const { data: latest, error: latestError } = await admin.from("agent_tasks").select("status,result,error_code")
        .eq("owner_id", PERSONAL_OWNER_ID).eq("id", id).maybeSingle();
      if (latestError) throw new Error("Task status could not be reloaded.");
      const completed = latest?.status === "completed";
      const failed = latest?.status === "failed";
      return {
        taskId: id,
        status: latest?.status ?? "waiting_for_device",
        ...(agent ? { agent: { id: agent.id, name: agent.name } } : {}),
        plan,
        toolResults: results,
        pendingJobs,
        ...(completed ? { result: latest.result } : failed
          ? { error: "Device execution finished, but task finalization failed. Check Task History for diagnostics.", code: latest.error_code }
          : { message: "Waiting for a connected device to execute its registered tools." }),
      };
    }

    await assertTaskNotCancelled(admin, id);
    failedStage = "synthesis";
    assertAgentTaskTimeBudget(startedAt, Date.now(), budget);
    await setTask(admin, id, { status: "synthesizing", tool_results: results });
    await assertTaskNotCancelled(admin, id);
    await event(admin, id, "task.synthesizing");
    const synthesisRequest: AIGenerationRequest = {
      messages: [
        { role: "system", content: buildSynthesisSystemPrompt(agent?.role, agent?.instructions) },
        { role: "user", content: buildSynthesisUserContent(task, plan, results) },
      ],
      temperature: 0.2,
      maxOutputTokens: budget.maxSynthesisTokens,
    };
    const synthesis = agent
      ? await executeAgentWorkflow(PERSONAL_OWNER_ID, "summarization", synthesisRequest, {
          providerPreference: agent.providerPreference,
          modelPreference: agent.modelPreference,
        })
      : await executeUserWorkflow(PERSONAL_OWNER_ID, "summarization", synthesisRequest);
    assertAgentTaskTimeBudget(startedAt, Date.now(), budget);
    const result = synthesis.route.providerId !== "mock"
      ? guardSynthesisAnswer(synthesis.result.text, results)
      : "AI synthesis unavailable. No model-generated conclusion was produced. Raw tool outputs follow; they are observations and are not independently verified.\n" +
        JSON.stringify(results, null, 2) +
        (results.length ? "" : "\nNo registered tool returned evidence. Configure an AI provider and enable appropriate evidence tools before relying on a conclusion.");
    failedStage = "finalization";
    const completedAt = new Date().toISOString();
    const { data: completedTask, error: completionError } = await admin.from("agent_tasks")
      .update({ status: "completed", result, completed_at: completedAt, updated_at: completedAt })
      .eq("id", id).eq("owner_id", PERSONAL_OWNER_ID)
      .eq("status", "synthesizing").is("cancellation_requested_at", null)
      .select("id").maybeSingle();
    if (completionError) throw new Error("Task completion could not be saved.");
    if (!completedTask) throw new AgentTaskCancelledError();
    await event(admin, id, "task.completed");
    return {
      taskId: id,
      status: "completed",
      ...(agent ? { agent: { id: agent.id, name: agent.name } } : {}),
      plan,
      toolResults: results,
      result,
    };
  } catch (error) {
    let cancellationRequested = error instanceof AgentTaskCancelledError;
    if (!cancellationRequested) {
      const { data: lifecycle } = await admin.from("agent_tasks")
        .select("status,cancellation_requested_at")
        .eq("id", id).eq("owner_id", PERSONAL_OWNER_ID).maybeSingle();
      cancellationRequested = lifecycle?.status === "cancelled" ||
        isAgentTaskCancellationRequested(lifecycle?.cancellation_requested_at);
    }
    if (cancellationRequested) {
      const cancelledAt = new Date().toISOString();
      const { data: cancelledTask, error: cancelError } = await admin.from("agent_tasks")
        .update({ status: "cancelled", completed_at: cancelledAt, updated_at: cancelledAt })
        .eq("id", id).eq("owner_id", PERSONAL_OWNER_ID)
        .not("status", "in", '("completed","failed","cancelled")')
        .select("id").maybeSingle();
      if (cancelError) throw new Error("Task cancellation could not be persisted.");
      if (cancelledTask) await event(admin, id, "task.cancelled", { cooperative: true });
      return { taskId: id, status: "cancelled", code: "AGENT_TASK_CANCELLED" };
    }
    const code = error instanceof AgentTaskBudgetExceededError
      ? "AGENT_BUDGET_EXCEEDED"
      : error instanceof Error && /invalid|registered|validation|planner/i.test(error.message)
        ? "AGENT_EXECUTION_REJECTED" : "AGENT_EXECUTION_FAILED";
    const message = safeAgentFailureMessage(error);
    console.warn("[agent-worker] Task execution failed:", { taskId: id, stage: failedStage, code, message });
    try {
      const failedAt = new Date().toISOString();
      await setTask(admin, id, { status: "failed", error_code: code, completed_at: failedAt });
      await event(admin, id, "task.failed", { code, stage: failedStage, message });
    }
    catch { /* Preserve the original task failure. */ }
    return {
      taskId: id,
      status: "failed",
      error: "Task execution failed validation or an internal step. Check task history for safe status details.",
      code,
    };
  } finally {
    clearInterval(heartbeat);
  }
}

export async function submitAgentTask(taskInput: string, agentId?: string, idempotencyKey?: string, options: { deferExecution?: boolean } = {}) {
  if (typeof taskInput !== "string" || !taskInput.trim() || taskInput.length > 4000) {
    throw new Error("Task must be 1–4000 characters.");
  }
  if (idempotencyKey?.startsWith(AGENT_TASK_RETRY_PREFIX)) {
    throw new Error("RESERVED_IDEMPOTENCY_KEY_PREFIX");
  }
  const task = taskInput.trim();
  const admin = createAdminClient();
  const agent = agentId ? await loadAgentDefinition(admin, agentId) : null;
  const requestFingerprint = createAgentTaskRequestFingerprint(task, agent?.id ?? null);
  if (idempotencyKey) {
    const { data: existing, error: existingError } = await admin.from("agent_tasks")
      .select("id,status,request_fingerprint")
      .eq("owner_id", PERSONAL_OWNER_ID)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingError) throw new Error("Task idempotency is unavailable. Apply the Agent task idempotency migration.");
    if (existing) {
      if (!isSameAgentTaskRequest(existing.request_fingerprint, requestFingerprint)) {
        throw new Error("IDEMPOTENCY_KEY_REUSED");
      }
      return {
        taskId: existing.id as string,
        status: existing.status as string,
        replayed: true,
        message: "This idempotency key already created the task; the existing task was returned.",
      };
    }
  }
  const agentSnapshot = agent ? {
    name: agent.name,
    role: agent.role,
    instructions: agent.instructions,
    providerPreference: agent.providerPreference,
    modelPreference: agent.modelPreference,
    allowedTools: agent.allowedTools,
    maxSteps: agent.maxSteps,
    maxToolCalls: agent.maxToolCalls,
  } : null;
  const { data: created, error: createError } = await admin.from("agent_tasks")
    .insert({
      owner_id: PERSONAL_OWNER_ID,
      status: "queued",
      task,
      ...(idempotencyKey ? { idempotency_key: idempotencyKey, request_fingerprint: requestFingerprint } : {}),
      ...(agent ? { agent_definition_id: agent.id, agent_snapshot: agentSnapshot } : {}),
    }).select("id").single();
  if (createError || !created) {
    if (idempotencyKey && createError?.code === "23505") {
      const { data: raced, error: racedError } = await admin.from("agent_tasks")
        .select("id,status,request_fingerprint")
        .eq("owner_id", PERSONAL_OWNER_ID)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (!racedError && raced && isSameAgentTaskRequest(raced.request_fingerprint, requestFingerprint)) {
        return {
          taskId: raced.id as string,
          status: raced.status as string,
          replayed: true,
          message: "This idempotency key already created the task; the existing task was returned.",
        };
      }
      if (!racedError && raced) throw new Error("IDEMPOTENCY_KEY_REUSED");
    }
    throw new Error("Unable to create task.");
  }
  const id = created.id as string;
  if (options.deferExecution) {
    return {
      taskId: id,
      status: "queued",
      ...(agent ? { agent: { id: agent.id, name: agent.name } } : {}),
      message: "Task persisted and queued for the Agent worker.",
    };
  }
  return executeAgentTaskRecord(admin, id, task, agent);
}

export async function retryAgentTask(taskId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId)) {
    throw new Error("INVALID_TASK_ID");
  }
  const admin = createAdminClient();
  const { data: task, error: taskError } = await admin.from("agent_tasks")
    .select("id,status,task,plan,tool_results,error_code,agent_definition_id,agent_snapshot,cancellation_requested_at,idempotency_key")
    .eq("owner_id", PERSONAL_OWNER_ID).eq("id", taskId).maybeSingle();
  if (taskError) throw new Error("TASK_RETRY_UNAVAILABLE");
  if (!task) return null;

  const parsedRetryKey = parseAgentTaskRetryKey(task.idempotency_key);
  const rootTaskId = parsedRetryKey?.rootTaskId ?? task.id;
  const [retryResult, failureResult, activityResult, jobResult] = await Promise.all([
    admin.from("agent_tasks").select("id,status,created_at,idempotency_key")
      .eq("owner_id", PERSONAL_OWNER_ID)
      .like("idempotency_key", AGENT_TASK_RETRY_PREFIX + rootTaskId + ":%")
      .order("created_at", { ascending: false })
      .limit(MAX_AGENT_TASK_RETRIES + 1),
    admin.from("agent_task_events").select("payload,created_at")
      .eq("owner_id", PERSONAL_OWNER_ID).eq("task_id", task.id)
      .eq("event_type", "task.failed")
      .order("created_at", { ascending: false }).limit(1),
    admin.from("agent_task_events").select("id")
      .eq("owner_id", PERSONAL_OWNER_ID).eq("task_id", task.id)
      .in("event_type", ["tool.requested", "tool.claimed", "tool.completed", "tool.failed"])
      .limit(1),
    admin.from("agent_tool_jobs").select("id")
      .eq("owner_id", PERSONAL_OWNER_ID).eq("task_id", task.id).limit(1),
  ]);
  if (retryResult.error || failureResult.error || activityResult.error || jobResult.error) {
    throw new Error("TASK_RETRY_UNAVAILABLE");
  }

  const retries = retryResult.data ?? [];
  const terminal = new Set(["completed", "failed", "cancelled"]);
  const latestRetry = retries[0];
  const latestAttemptId = latestRetry?.id ?? rootTaskId;
  if (task.id !== latestAttemptId && latestRetry && !terminal.has(latestRetry.status)) {
    const parsedLatest = parseAgentTaskRetryKey(latestRetry.idempotency_key);
    return {
      taskId: latestRetry.id as string,
      status: latestRetry.status as string,
      retryOf: task.id,
      attempt: parsedLatest?.attempt ?? retries.length,
      replayed: true,
      message: "This safe retry is already queued or running; the existing task was returned.",
    };
  }

  const failurePayload = failureResult.data?.[0]?.payload;
  const failedStage = isRecord(failurePayload) && typeof failurePayload.stage === "string"
    ? failurePayload.stage : null;
  const decision = evaluateSafeAgentTaskRetry({
    status: task.status,
    errorCode: task.error_code,
    failedStage,
    plan: task.plan,
    toolResults: task.tool_results,
    cancellationRequestedAt: task.cancellation_requested_at,
    hasToolActivity: (activityResult.data?.length ?? 0) > 0,
    hasDeviceJobs: (jobResult.data?.length ?? 0) > 0,
    retryCount: retries.length,
    isLatestAttempt: task.id === latestAttemptId,
    retryInProgress: retries.some((item) => !terminal.has(item.status)),
  });
  if (!decision.allowed) throw new Error("TASK_RETRY_" + decision.reason);

  if (typeof task.agent_definition_id === "string") {
    if (!isRecord(task.agent_snapshot)) throw new Error("TASK_RETRY_AGENT_SNAPSHOT_INVALID");
    const snapshot = task.agent_snapshot;
    const parsed = parseAgentDefinition({
      name: snapshot.name,
      description: typeof snapshot.description === "string" ? snapshot.description : "",
      role: snapshot.role,
      instructions: snapshot.instructions,
      providerPreference: snapshot.providerPreference,
      modelPreference: snapshot.modelPreference,
      allowedTools: snapshot.allowedTools,
      maxSteps: snapshot.maxSteps,
      maxToolCalls: snapshot.maxToolCalls,
      enabled: true,
    });
    if (!parsed.ok) throw new Error("TASK_RETRY_AGENT_SNAPSHOT_INVALID");
  }

  const retryKey = createAgentTaskRetryKey(rootTaskId, decision.nextAttempt);
  const { data: created, error: createError } = await admin.from("agent_tasks").insert({
    owner_id: PERSONAL_OWNER_ID,
    status: "queued",
    task: task.task,
    idempotency_key: retryKey,
    request_fingerprint: createAgentTaskRequestFingerprint(
      String(task.task),
      typeof task.agent_definition_id === "string" ? task.agent_definition_id : null,
    ),
    ...(typeof task.agent_definition_id === "string"
      ? { agent_definition_id: task.agent_definition_id, agent_snapshot: task.agent_snapshot }
      : {}),
  }).select("id").single();

  if (createError || !created) {
    if (createError?.code === "23505") {
      const { data: existing, error: existingError } = await admin.from("agent_tasks").select("id,status")
        .eq("owner_id", PERSONAL_OWNER_ID).eq("idempotency_key", retryKey).maybeSingle();
      if (!existingError && existing) {
        return {
          taskId: existing.id as string,
          status: existing.status as string,
          retryOf: task.id,
          attempt: decision.nextAttempt,
          replayed: true,
          message: "This safe retry was already queued; the existing task was returned.",
        };
      }
    }
    throw new Error("TASK_RETRY_UNAVAILABLE");
  }

  return {
    taskId: created.id as string,
    status: "queued",
    retryOf: task.id,
    attempt: decision.nextAttempt,
    replayed: false,
    message: "A new task was queued from a planning-only failure. The original failed task remains unchanged.",
  };
}

export async function processQueuedAgentTasks(limit = 3): Promise<number> {
  const admin = createAdminClient();
  const batchSize = Math.max(1, Math.min(3, Math.floor(limit)));
  const { data: queued, error: queueError } = await admin.from("agent_tasks")
    .select("id")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(batchSize);
  if (queueError) throw new Error("Agent task queue is unavailable.");

  let processed = 0;
  await Promise.all((queued ?? []).map(async (candidate) => {
    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin.from("agent_tasks").update({
      status: "planning",
      updated_at: claimedAt,
    }).eq("owner_id", PERSONAL_OWNER_ID)
      .eq("id", candidate.id)
      .eq("status", "queued")
      .is("cancellation_requested_at", null)
      .select("id,task,agent_definition_id,agent_snapshot,idempotency_key")
      .maybeSingle();
    if (claimError) throw new Error("Agent task could not be claimed.");
    if (!claimed) return;

    let agent: ({ id: string } & AgentDefinitionInput) | null = null;
    if (typeof claimed.agent_definition_id === "string") {
      const snapshot = isRecord(claimed.agent_snapshot) ? claimed.agent_snapshot : {};
      const parsed = parseAgentDefinition({
        name: snapshot.name,
        description: typeof snapshot.description === "string" ? snapshot.description : "",
        role: snapshot.role,
        instructions: snapshot.instructions,
        providerPreference: snapshot.providerPreference,
        modelPreference: snapshot.modelPreference,
        allowedTools: snapshot.allowedTools,
        maxSteps: snapshot.maxSteps,
        maxToolCalls: snapshot.maxToolCalls,
        enabled: true,
      });
      if (!parsed.ok) {
        await setTask(admin, claimed.id, { status: "failed", error_code: "AGENT_SNAPSHOT_INVALID", completed_at: new Date().toISOString() });
        await event(admin, claimed.id, "task.failed", {
          code: "AGENT_SNAPSHOT_INVALID",
          stage: "planning",
          message: "The saved Agent execution snapshot is invalid; no tools were run.",
        });
        processed += 1;
        return;
      }
      agent = { id: claimed.agent_definition_id, ...parsed.value };
    }

    const retryKey = parseAgentTaskRetryKey(claimed.idempotency_key);
    await executeAgentTaskRecord(
      admin,
      claimed.id,
      String(claimed.task),
      agent,
      retryKey ? { rootTaskId: retryKey.rootTaskId, attempt: retryKey.attempt } : undefined,
    );
    processed += 1;
  }));
  return processed;
}

export async function recoverStaleAgentTasks(staleAfterMs = 10 * 60 * 1000): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - Math.max(60_000, staleAfterMs)).toISOString();
  const { data: stale, error } = await admin.from("agent_tasks")
    .select("id,status")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .in("status", ["planning", "executing", "synthesizing"])
    .lt("updated_at", cutoff)
    .is("cancellation_requested_at", null)
    .order("updated_at", { ascending: true })
    .limit(25);
  if (error) throw new Error("Stale Agent task recovery is unavailable.");

  let recovered = 0;
  for (const task of stale ?? []) {
    const now = new Date().toISOString();
    const { data: failed, error: updateError } = await admin.from("agent_tasks").update({
      status: "failed",
      error_code: "AGENT_WORKER_INTERRUPTED",
      completed_at: now,
      updated_at: now,
    }).eq("owner_id", PERSONAL_OWNER_ID)
      .eq("id", task.id)
      .eq("status", task.status)
      .lt("updated_at", cutoff)
      .is("cancellation_requested_at", null)
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error("Interrupted Agent task state could not be recovered.");
    if (!failed) continue;
    await event(admin, task.id, "task.failed", {
      code: "AGENT_WORKER_INTERRUPTED",
      stage: task.status,
      message: "The Agent worker heartbeat expired. The task was not replayed automatically because tool side effects cannot be assumed safe to repeat. Retry it as a new task.",
    });
    recovered += 1;
  }
  return recovered;
}

export async function getAgentTaskStatus(taskId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw new Error("A valid task UUID is required.");
  try { await finalizeAgentTaskIfReady(taskId); } catch { /* Keep status reads available; finalization state is persisted when possible. */ }
  const admin = createAdminClient();
  const [taskResult, eventResult, jobResult] = await Promise.all([
    admin.from("agent_tasks").select("id,status,task,plan,tool_results,result,error_code,created_at,updated_at,completed_at")
      .eq("owner_id", PERSONAL_OWNER_ID).eq("id", taskId).maybeSingle(),
    admin.from("agent_task_events").select("id,event_type,payload,created_at")
      .eq("owner_id", PERSONAL_OWNER_ID).eq("task_id", taskId).order("created_at", { ascending: true }).limit(100),
    admin.from("agent_tool_jobs").select("id,device_id,tool_call_id,tool_id,status,result,error_code,requested_at,claimed_at,completed_at")
      .eq("owner_id", PERSONAL_OWNER_ID).eq("task_id", taskId).order("requested_at", { ascending: true }),
  ]);
  if (taskResult.error || eventResult.error || jobResult.error) throw new Error("Task status is unavailable.");
  if (!taskResult.data) return null;
  return { task: taskResult.data, events: eventResult.data ?? [], deviceJobs: jobResult.data ?? [] };
}
