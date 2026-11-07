import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID } from "@/server/security/owner-auth";
import { parseDeviceJobDispatch } from "@/server/agent/device-contract";
import { executeRegisteredTool } from "@/server/tools/registry";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(args: Record<string, unknown>, allowed: string[]) {
  return Object.keys(args).every((key) => allowed.includes(key));
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function executeBackendTool(name: string, args: Record<string, unknown>) {
  if (name.startsWith("text.")) return executeRegisteredTool(name, args);

  if (name === "memory.search") {
    if (!onlyKeys(args, ["namespace", "query", "limit"])) throw new Error("Unsupported memory.search arguments.");
    const namespace = args.namespace === undefined ? "default" : args.namespace;
    const query = args.query === undefined ? "" : args.query;
    const limit = args.limit === undefined ? 20 : args.limit;
    if (typeof namespace !== "string" || namespace.trim().length < 1 || namespace.length > 80 ||
        typeof query !== "string" || query.length > 160 ||
        typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new Error("Invalid memory.search arguments.");
    }
    const admin = createAdminClient();
    let builder = admin.from("agent_memories")
      .select("id,namespace,memory_key,content,metadata,source,importance,created_at,updated_at")
      .eq("owner_id", PERSONAL_OWNER_ID)
      .eq("namespace", namespace)
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (query) builder = builder.ilike("content", "%" + escapeLike(query) + "%");
    const { data, error } = await builder;
    if (error) throw new Error("Memory search is unavailable.");
    return { memories: data ?? [], count: data?.length ?? 0 };
  }

  if (name === "memory.store") {
    if (!onlyKeys(args, ["namespace", "key", "content", "importance", "metadata"]) ||
        typeof args.key !== "string" || !args.key.trim() || args.key.length > 160 ||
        typeof args.content !== "string" || !args.content.trim() || args.content.length > 12000) {
      throw new Error("Invalid memory.store arguments.");
    }
    const namespace = args.namespace === undefined ? "default" : args.namespace;
    const importance = args.importance === undefined ? 3 : args.importance;
    const metadata = args.metadata === undefined ? {} : args.metadata;
    if (typeof namespace !== "string" || !namespace.trim() || namespace.length > 80 ||
        typeof importance !== "number" || !Number.isInteger(importance) || importance < 1 || importance > 5 ||
        !isRecord(metadata) || Buffer.byteLength(JSON.stringify(metadata), "utf8") > 8000) {
      throw new Error("Invalid memory.store metadata, namespace or importance.");
    }
    const admin = createAdminClient();
    const { data, error } = await admin.from("agent_memories").upsert({
      owner_id: PERSONAL_OWNER_ID,
      namespace: namespace.trim(),
      memory_key: args.key.trim(),
      content: args.content.trim(),
      importance,
      metadata,
      source: "agent",
    }, { onConflict: "owner_id,namespace,memory_key" })
      .select("id,namespace,memory_key,content,importance,source,updated_at")
      .single();
    if (error || !data) throw new Error("Memory could not be saved.");
    return { saved: true, memory: data };
  }

  if (name === "device.list") {
    if (Object.keys(args).length) throw new Error("device.list does not accept arguments.");
    const admin = createAdminClient();
    const { data, error } = await admin.from("agent_devices")
      .select("device_id,display_name,platform,app_version,capabilities,status,last_seen_at")
      .eq("owner_id", PERSONAL_OWNER_ID)
      .order("last_seen_at", { ascending: false });
    if (error) throw new Error("Device registry is unavailable.");
    return { devices: data ?? [] };
  }

  if (name === "device.dispatch_tool") {
    const parsed = parseDeviceJobDispatch(args);
    if (!parsed.ok) throw new Error(parsed.error);
    const input = parsed.value;
    const admin = createAdminClient();
    const { data: device, error: deviceError } = await admin.from("agent_devices")
      .select("device_id,capabilities")
      .eq("owner_id", PERSONAL_OWNER_ID)
      .eq("device_id", input.deviceId)
      .maybeSingle();
    if (deviceError) throw new Error("Device registry is unavailable.");
    if (!device) throw new Error("Device is not registered.");
    const capabilities = Array.isArray(device.capabilities) ? device.capabilities as Array<{ id?: unknown }> : [];
    if (!capabilities.some((capability) => capability?.id === input.toolId)) {
      throw new Error("The requested tool is not registered by this device.");
    }
    if (input.taskId) {
      const { data: task, error: taskError } = await admin.from("agent_tasks")
        .select("id").eq("owner_id", PERSONAL_OWNER_ID).eq("id", input.taskId).maybeSingle();
      if (taskError) throw new Error("Task registry is unavailable.");
      if (!task) throw new Error("Task not found.");
    }
    const { data: job, error } = await admin.from("agent_tool_jobs").insert({
      owner_id: PERSONAL_OWNER_ID,
      task_id: input.taskId ?? null,
      device_id: input.deviceId,
      tool_call_id: input.toolCallId,
      tool_id: input.toolId,
      arguments: input.arguments,
      status: "queued",
    }).select("id,task_id,device_id,tool_call_id,tool_id,status,requested_at").single();
    if (error || !job) throw new Error("Tool job could not be queued.");
    if (input.taskId) {
      await admin.from("agent_tasks").update({ status: "waiting_for_device", updated_at: new Date().toISOString() })
        .eq("owner_id", PERSONAL_OWNER_ID).eq("id", input.taskId);
      await admin.from("agent_task_events").insert({
        task_id: input.taskId,
        owner_id: PERSONAL_OWNER_ID,
        event_type: "tool.requested",
        payload: { jobId: job.id, deviceId: input.deviceId, toolId: input.toolId, toolCallId: input.toolCallId },
      });
    }
    return { queued: true, job };
  }

  throw new Error("Tool is not registered.");
}
