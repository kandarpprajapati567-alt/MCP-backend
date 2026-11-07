import { executeBackendTool } from "@/server/tools/executor";

function onlyKeys(args: Record<string, unknown>, allowed: string[]) {
  return Object.keys(args).every((key) => allowed.includes(key));
}

export async function executeMcpTool(name: string, args: Record<string, unknown>) {
  if (name === "agent.submit_task") {
    if (!onlyKeys(args, ["task"]) || typeof args.task !== "string" ||
        !args.task.trim() || args.task.length > 4000) {
      throw new Error("agent.submit_task requires a task between 1 and 4000 characters.");
    }
    const { submitAgentTask } = await import("@/server/agent/task-service");
    return submitAgentTask(args.task);
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
