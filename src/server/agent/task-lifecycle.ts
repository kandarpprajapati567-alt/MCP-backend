export type AgentTaskLifecycleStatus =
  | "queued"
  | "planning"
  | "awaiting_approval"
  | "waiting_for_device"
  | "executing"
  | "synthesizing"
  | "completed"
  | "failed"
  | "cancelled";

export type CancellationDisposition = "cancel_now" | "request" | "already_terminal";

const TERMINAL_STATUSES = new Set<AgentTaskLifecycleStatus>(["completed", "failed", "cancelled"]);
const IMMEDIATE_CANCELLATION_STATUSES = new Set<AgentTaskLifecycleStatus>([
  "queued",
  "awaiting_approval",
  "waiting_for_device",
]);

export function getCancellationDisposition(status: string): CancellationDisposition {
  if (TERMINAL_STATUSES.has(status as AgentTaskLifecycleStatus)) return "already_terminal";
  if (IMMEDIATE_CANCELLATION_STATUSES.has(status as AgentTaskLifecycleStatus)) return "cancel_now";
  if (["planning", "executing", "synthesizing"].includes(status)) return "request";
  throw new Error("Unknown Agent task status.");
}

export function isAgentTaskCancellationRequested(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}

export class AgentTaskCancelledError extends Error {
  constructor() {
    super("Agent task cancellation requested.");
    this.name = "AgentTaskCancelledError";
  }
}
