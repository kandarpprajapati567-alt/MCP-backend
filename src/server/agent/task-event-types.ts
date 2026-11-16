export const AGENT_TASK_EVENT_TYPES = [
  "task.created",
  "task.planning",
  "task.plan_ready",
  "task.executing",
  "tool.requested",
  "tool.claimed",
  "tool.completed",
  "tool.failed",
  "task.synthesizing",
  "task.completed",
  "task.failed",
  "task.cancelled",
  "task.cancellation_requested",
  "device.registered",
  "device.heartbeat",
  "memory.created",
  "memory.updated",
  "memory.deleted",
] as const;

export type AgentTaskEventType = (typeof AGENT_TASK_EVENT_TYPES)[number];
