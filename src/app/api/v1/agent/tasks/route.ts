import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { createAgentPlan, type AvailableDeviceTool } from "@/server/agent/planner";
import { executeMcpTool } from "@/server/mcp/tools";
import { executeUserWorkflow } from "@/server/ai/routing/runtime-executor";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function event(
  admin: ReturnType<typeof createAdminClient>,
  taskId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
) {
  const { error } = await admin.from("agent_task_events").insert({
    task_id: taskId,
    owner_id: PERSONAL_OWNER_ID,
    event_type: eventType,
    payload,
  });
  if (error) throw new Error("Unable to persist task event.");
}

async function setTask(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  patch: Record<string, unknown>,
) {
  const { error } = await admin.from("agent_tasks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", PERSONAL_OWNER_ID);
  if (error) throw new Error("Unable to update task.");
}

function localPlan(task: string) {
  const lower = task.toLowerCase();
  const toolId = lower.includes("word count") || lower.includes("count words")
    ? "text.word_count"
    : lower.includes("keyword")
      ? "text.extract_keywords"
      : lower.includes("text stats") || lower.includes("character count")
        ? "text.text_stats"
        : null;

  return {
    version: 1 as const,
    goal: task.slice(0, 500),
    steps: [{
      id: "step-1",
      objective: "Interpret the request and complete the available safe operation.",
      expectedOutcome: "A bounded result with execution evidence.",
    }],
    toolCalls: toolId ? [{ id: "call-1", toolId, arguments: { text: task } }] : [],
  };
}

async function getAvailableDeviceTools(admin: ReturnType<typeof createAdminClient>): Promise<AvailableDeviceTool[]> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await admin.from("agent_devices")
    .select("device_id,capabilities")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .eq("status", "online")
    .gte("last_seen_at", cutoff)
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
          required: Array.isArray(raw.inputSchema.required) ? raw.inputSchema.required.filter((x): x is string => typeof x === "string") : [],
          additionalProperties: false,
        },
      });
      seen.add(raw.id);
    }
  }
  return tools.slice(0, 40);
}

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const admin = createAdminClient();
  const { data, error } = await admin.from("agent_tasks")
    .select("id,status,task,plan,tool_results,result,error_code,created_at,updated_at,completed_at")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return json({ error: "Unable to load task history." }, 500);
  return json({ tasks: data ?? [] });
}

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 16000) return json({ error: "Request body too large." }, 413);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  if (!isRecord(body) || typeof body.task !== "string") return json({ error: "task is required." }, 400);
  const task = body.task.trim();
  if (!task || task.length > 4000) return json({ error: "Task must be 1–4000 characters." }, 400);

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.from("agent_tasks")
    .insert({ owner_id: PERSONAL_OWNER_ID, status: "queued", task })
    .select("id")
    .single();
  if (createError || !created) return json({ error: "Unable to create task." }, 500);
  const id = created.id as string;

  try {
    await event(admin, id, "task.created");
    await setTask(admin, id, { status: "planning" });
    await event(admin, id, "task.planning");

    const deviceTools = await getAvailableDeviceTools(admin);
    const planned = await createAgentPlan(PERSONAL_OWNER_ID, task, deviceTools);
    const plan = planned ?? localPlan(task);
    await setTask(admin, id, { plan, status: "executing" });
    await event(admin, id, "task.plan_ready", {
      steps: plan.steps.length,
      toolCalls: plan.toolCalls.length,
      deviceToolsAvailable: deviceTools.length,
      planner: planned ? "configured-workflow-policy" : "local-safe-planner",
    });
    await event(admin, id, "task.executing");

    const results: Array<{ callId: string; toolId: string; result: unknown }> = [];
    const pendingJobs: Array<{ id: string; deviceId: string; toolId: string }> = [];

    for (const call of plan.toolCalls) {
      const deviceTool = deviceTools.find((tool) => tool.id === call.toolId);
      if (deviceTool) {
        const { data: job, error } = await admin.from("agent_tool_jobs").insert({
          owner_id: PERSONAL_OWNER_ID,
          task_id: id,
          device_id: deviceTool.deviceId,
          tool_call_id: call.id,
          tool_id: call.toolId,
          arguments: call.arguments,
          status: "queued",
        }).select("id,device_id,tool_id").single();
        if (error || !job) throw new Error("Device tool job could not be queued.");
        pendingJobs.push({ id: job.id, deviceId: job.device_id, toolId: job.tool_id });
        await event(admin, id, "tool.requested", {
          jobId: job.id,
          deviceId: job.device_id,
          toolId: job.tool_id,
          toolCallId: call.id,
        });
      } else {
        const result = await executeMcpTool(call.toolId, call.arguments);
        results.push({ callId: call.id, toolId: call.toolId, result });
        await event(admin, id, "tool.completed", { callId: call.id, toolId: call.toolId });
      }
    }

    if (pendingJobs.length) {
      await setTask(admin, id, { status: "waiting_for_device", tool_results: results });
      return json({
        taskId: id,
        status: "waiting_for_device",
        plan,
        toolResults: results,
        pendingJobs,
        message: "Waiting for a connected device to execute its registered tools.",
      }, 202);
    }

    await setTask(admin, id, { status: "synthesizing", tool_results: results });
    await event(admin, id, "task.synthesizing");
    const synthesis = await executeUserWorkflow(PERSONAL_OWNER_ID, "summarization", {
      messages: [
        { role: "system", content: "Synthesize the outcome using only the task, plan and verified tool results. Do not claim unperformed actions." },
        { role: "user", content: JSON.stringify({ task, plan, toolResults: results }) },
      ],
      temperature: 0.2,
      maxOutputTokens: 1200,
    });

    const result = synthesis.route.providerId !== "mock"
      ? synthesis.result.text
      : results.length
        ? "Task completed using " + results.length + " registered tool(s).\n" + JSON.stringify(results, null, 2)
        : "Task planned successfully. No registered tool was required.\nGoal: " + plan.goal +
          "\nSteps: " + plan.steps.map((step) => step.objective).join("; ") +
          "\nConfigure an AI provider to enable model-based planning and synthesis.";

    await setTask(admin, id, { status: "completed", result, completed_at: new Date().toISOString() });
    await event(admin, id, "task.completed");
    return json({ taskId: id, status: "completed", plan, toolResults: results, result }, 201);
  } catch (error) {
    const code = error instanceof Error && /invalid|registered|validation|planner/i.test(error.message)
      ? "AGENT_EXECUTION_REJECTED"
      : "AGENT_EXECUTION_FAILED";
    try {
      await setTask(admin, id, { status: "failed", error_code: code });
      await event(admin, id, "task.failed", { code });
    } catch { /* Preserve the original task failure. */ }
    return json({
      taskId: id,
      status: "failed",
      error: "Task execution failed validation or an internal step. Check task history for safe status details.",
      code,
    }, 500);
  }
}
