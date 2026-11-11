import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID } from "@/server/security/owner-auth";
import { createAgentPlan, type AvailableDeviceTool } from "@/server/agent/planner";
import { parseAgentDefinition, type AgentDefinitionInput } from "@/server/agent/definition-schema";
import { executeAgentWorkflow } from "@/server/ai/routing/runtime-executor";
import { executeBackendTool } from "@/server/tools/executor";
import { executeUserWorkflow } from "@/server/ai/routing/runtime-executor";
import type { AIGenerationRequest } from "@/server/ai/providers/types";
import { safeAgentFailureMessage } from "@/server/agent/failure-diagnostics";
import { finalizeAgentTaskIfReady } from "@/server/agent/task-finalizer";

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

function localPlan(task: string, agent?: AgentDefinitionInput) {
  const lower = task.toLowerCase();
  const toolId = lower.includes("word count") || lower.includes("count words")
    ? "text.word_count"
    : lower.includes("keyword")
      ? "text.extract_keywords"
      : lower.includes("text stats") || lower.includes("character count")
        ? "text.text_stats"
        : null;
  if (toolId && agent && (!agent.allowedTools.includes(toolId) || agent.maxToolCalls === 0)) {
    return {
      version: 1 as const,
      goal: task.slice(0, 500),
      steps: [{ id: "step-1", objective: "Complete the request without using tools outside the Agent allowlist.", expectedOutcome: "A bounded result with execution evidence." }],
      toolCalls: [],
    };
  }
  return {
    version: 1 as const,
    goal: task.slice(0, 500),
    steps: [{ id: "step-1", objective: "Interpret the request and complete the available safe operation.", expectedOutcome: "A bounded result with execution evidence." }],
    toolCalls: toolId ? [{ id: "call-1", toolId, arguments: { text: task } }] : [],
  };
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

export async function submitAgentTask(taskInput: string, agentId?: string) {
  if (typeof taskInput !== "string" || !taskInput.trim() || taskInput.length > 4000) {
    throw new Error("Task must be 1–4000 characters.");
  }
  const task = taskInput.trim();
  const admin = createAdminClient();
  const agent = agentId ? await loadAgentDefinition(admin, agentId) : null;
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
      ...(agent ? { agent_definition_id: agent.id, agent_snapshot: agentSnapshot } : {}),
    }).select("id").single();
  if (createError || !created) throw new Error("Unable to create task.");
  const id = created.id as string;
  let failedStage: "planning" | "policy_validation" | "tool_execution" | "synthesis" | "finalization" = "planning";

  try {
    await event(admin, id, "task.created");
    await setTask(admin, id, { status: "planning" });
    await event(admin, id, "task.planning");

    const deviceTools = await getAvailableDeviceTools(admin);
    const planned = agent
      ? await createAgentPlan(PERSONAL_OWNER_ID, task, deviceTools, agent)
      : await createAgentPlan(PERSONAL_OWNER_ID, task, deviceTools);
    const plan = planned ?? localPlan(task, agent ?? undefined);
    failedStage = "policy_validation";
    if (agent && (plan.steps.length > agent.maxSteps || plan.toolCalls.length > agent.maxToolCalls ||
        plan.toolCalls.some((call) => !agent.allowedTools.includes(call.toolId)))) {
      throw new Error("Agent execution policy rejected the generated plan.");
    }
    await setTask(admin, id, { plan, status: "executing" });
    await event(admin, id, "task.plan_ready", {
      steps: plan.steps.length,
      toolCalls: plan.toolCalls.length,
      deviceToolsAvailable: deviceTools.length,
      planner: planned ? "configured-workflow-policy" : "local-safe-planner",
      ...(agent ? { agentId: agent.id, agentName: agent.name, maxSteps: agent.maxSteps, maxToolCalls: agent.maxToolCalls } : {}),
    });
    await event(admin, id, "task.executing");

    const results: Array<{ callId: string; toolId: string; result: unknown }> = [];
    const pendingJobs: Array<{ id: string; deviceId: string; toolId: string }> = [];
    failedStage = "tool_execution";
    for (const call of plan.toolCalls) {
      const deviceTool = deviceTools.find((tool) => tool.id === call.toolId);
      if (deviceTool) {
        const { data: job, error } = await admin.from("agent_tool_jobs").insert({
          owner_id: PERSONAL_OWNER_ID, task_id: id, device_id: deviceTool.deviceId,
          tool_call_id: call.id, tool_id: call.toolId, arguments: call.arguments, status: "queued",
        }).select("id,device_id,tool_id").single();
        if (error || !job) throw new Error("Device tool job could not be queued.");
        pendingJobs.push({ id: job.id, deviceId: job.device_id, toolId: job.tool_id });
        await event(admin, id, "tool.requested", { jobId: job.id, deviceId: job.device_id, toolId: job.tool_id, toolCallId: call.id });
      } else {
        const result = await executeBackendTool(call.toolId, call.arguments);
        results.push({ callId: call.id, toolId: call.toolId, result });
        await event(admin, id, "tool.completed", { callId: call.id, toolId: call.toolId });
      }
    }

    if (pendingJobs.length) {
      await setTask(admin, id, { status: "waiting_for_device", tool_results: results });
      try { await finalizeAgentTaskIfReady(id); } catch { /* A later device callback can retry finalization. */ }
      const { data: latest } = await admin.from("agent_tasks").select("status,result")
        .eq("owner_id", PERSONAL_OWNER_ID).eq("id", id).maybeSingle();
      const completed = latest?.status === "completed";
      return {
        taskId: id,
        status: latest?.status ?? "waiting_for_device",
        ...(agent ? { agent: { id: agent.id, name: agent.name } } : {}),
        plan,
        toolResults: results,
        pendingJobs,
        ...(completed ? { result: latest.result } : { message: "Waiting for a connected device to execute its registered tools." }),
      };
    }

    failedStage = "synthesis";
    await setTask(admin, id, { status: "synthesizing", tool_results: results });
    await event(admin, id, "task.synthesizing");
    const synthesisRequest: AIGenerationRequest = {
      messages: [
        { role: "system", content: agent
          ? `You are synthesizing results for Agent role: ${agent.role}. Agent guidance: <agent_instructions>${agent.instructions}</agent_instructions>. Use only the task, plan and verified tool results. Never claim unperformed actions; tool allowlists and execution limits remain mandatory.`
          : "Synthesize the outcome using only the task, plan and verified tool results. Do not claim unperformed actions." },
        { role: "user", content: JSON.stringify({ task, plan, toolResults: results }) },
      ],
      temperature: 0.2,
      maxOutputTokens: 1200,
    };
    const synthesis = agent
      ? await executeAgentWorkflow(PERSONAL_OWNER_ID, "summarization", synthesisRequest, {
          providerPreference: agent.providerPreference,
          modelPreference: agent.modelPreference,
        })
      : await executeUserWorkflow(PERSONAL_OWNER_ID, "summarization", synthesisRequest);
    const result = synthesis.route.providerId !== "mock"
      ? synthesis.result.text
      : results.length
        ? "Task completed using " + results.length + " registered tool(s).\n" + JSON.stringify(results, null, 2)
        : "Task planned successfully. No registered tool was required.\nGoal: " + plan.goal +
          "\nSteps: " + plan.steps.map((step) => step.objective).join("; ") +
          "\nConfigure an AI provider to enable model-based planning and synthesis.";
    failedStage = "finalization";
    await setTask(admin, id, { status: "completed", result, completed_at: new Date().toISOString() });
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
    const code = error instanceof Error && /invalid|registered|validation|planner/i.test(error.message)
      ? "AGENT_EXECUTION_REJECTED" : "AGENT_EXECUTION_FAILED";
    const message = safeAgentFailureMessage(error);
    try {
      await setTask(admin, id, { status: "failed", error_code: code });
      await event(admin, id, "task.failed", { code, stage: failedStage, message });
    }
    catch { /* Preserve the original task failure. */ }
    return {
      taskId: id,
      status: "failed",
      error: "Task execution failed validation or an internal step. Check task history for safe status details.",
      code,
    };
  }
}

export async function getAgentTaskStatus(taskId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw new Error("A valid task UUID is required.");
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
