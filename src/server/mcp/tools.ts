import { executeBackendTool } from "@/server/tools/executor";

function onlyKeys(args: Record<string, unknown>, allowed: string[]) {
  return Object.keys(args).every((key) => allowed.includes(key));
}

export async function executeMcpTool(name: string, args: Record<string, unknown>) {
  if (name === "agent.submit_task") {
    if (!onlyKeys(args, ["task", "agentId"]) || typeof args.task !== "string" ||
        !args.task.trim() || args.task.length > 4000 ||
        (args.agentId !== undefined && (typeof args.agentId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args.agentId)))) {
      throw new Error("agent.submit_task requires a task between 1 and 4000 characters and an optional valid agentId.");
    }
    const { submitAgentTask } = await import("@/server/agent/task-service");
    return submitAgentTask(args.task, args.agentId as string | undefined);
  }

  if (name === "agent.task_status") {
    if (!onlyKeys(args, ["taskId"]) || typeof args.taskId !== "string") {
      throw new Error("agent.task_status requires a taskId.");
    }
    const { getAgentTaskStatus } = await import("@/server/agent/task-service");
    const status = await getAgentTaskStatus(args.taskId);
    if (!status) throw new Error("Task not found.");
    return status;
  }

  return executeBackendTool(name, args);
}
