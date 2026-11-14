export const AGENT_TASK_RETRY_PREFIX = "fs-retry:";
export const MAX_AGENT_TASK_RETRIES = 2;

export type AgentTaskRetryReason =
  | "NOT_FAILED" | "CANCELLED" | "UNSAFE_FAILURE" | "PLAN_ALREADY_CREATED"
  | "TOOL_RESULTS_PRESENT" | "TOOL_ACTIVITY_PRESENT" | "DEVICE_JOB_PRESENT"
  | "RETRY_IN_PROGRESS" | "STALE_ATTEMPT" | "MAX_RETRIES" | "INVALID_RETRY_COUNT";

export type AgentTaskRetryDecision =
  | { allowed: true; nextAttempt: number }
  | { allowed: false; reason: AgentTaskRetryReason };

export type AgentTaskRetryInput = {
  status: string;
  errorCode: unknown;
  failedStage: unknown;
  plan: unknown;
  toolResults: unknown;
  cancellationRequestedAt: unknown;
  hasToolActivity: boolean;
  hasDeviceJobs: boolean;
  retryCount: number;
  isLatestAttempt: boolean;
  retryInProgress: boolean;
};

export function createAgentTaskRetryKey(rootTaskId: string, attempt: number): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rootTaskId) ||
      !Number.isInteger(attempt) || attempt < 1 || attempt > MAX_AGENT_TASK_RETRIES) {
    throw new Error("Invalid Agent task retry identity.");
  }
  return AGENT_TASK_RETRY_PREFIX + rootTaskId + ":" + attempt;
}

export function parseAgentTaskRetryKey(value: unknown): { rootTaskId: string; attempt: number } | null {
  if (typeof value !== "string") return null;
  const match = /^fs-retry:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([1-2])$/i.exec(value);
  return match ? { rootTaskId: match[1], attempt: Number(match[2]) } : null;
}

export function evaluateSafeAgentTaskRetry(input: AgentTaskRetryInput): AgentTaskRetryDecision {
  if (input.status !== "failed") return { allowed: false, reason: "NOT_FAILED" };
  if (input.cancellationRequestedAt !== null && input.cancellationRequestedAt !== undefined &&
      input.cancellationRequestedAt !== "") return { allowed: false, reason: "CANCELLED" };
  if (input.failedStage !== "planning" || input.errorCode !== "AGENT_EXECUTION_FAILED") {
    return { allowed: false, reason: "UNSAFE_FAILURE" };
  }
  if (input.plan !== null && input.plan !== undefined) return { allowed: false, reason: "PLAN_ALREADY_CREATED" };
  if (!Array.isArray(input.toolResults) || input.toolResults.length !== 0) {
    return { allowed: false, reason: "TOOL_RESULTS_PRESENT" };
  }
  if (input.hasToolActivity) return { allowed: false, reason: "TOOL_ACTIVITY_PRESENT" };
  if (input.hasDeviceJobs) return { allowed: false, reason: "DEVICE_JOB_PRESENT" };
  if (input.retryInProgress) return { allowed: false, reason: "RETRY_IN_PROGRESS" };
  if (!input.isLatestAttempt) return { allowed: false, reason: "STALE_ATTEMPT" };
  if (!Number.isInteger(input.retryCount) || input.retryCount < 0) {
    return { allowed: false, reason: "INVALID_RETRY_COUNT" };
  }
  if (input.retryCount >= MAX_AGENT_TASK_RETRIES) return { allowed: false, reason: "MAX_RETRIES" };
  return { allowed: true, nextAttempt: input.retryCount + 1 };
}
