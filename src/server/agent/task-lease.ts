export type AgentTaskLease = Readonly<{
  workerId: string;
  token: string;
}>;

export type AgentTaskLeaseRecord = {
  worker_id?: unknown;
  lease_token?: unknown;
  lease_expires_at?: unknown;
};

export type AgentTaskRecoveryDisposition = "failed" | "cancelled" | null;

const ACTIVE_STATUSES = new Set(["planning", "executing", "synthesizing"]);
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

export const AGENT_TASK_LEASE_SECONDS = 90;
export const AGENT_TASK_LEASE_HEARTBEAT_MS = 20_000;
export const AGENT_TASK_WORKER_BATCH_LIMIT = 3;

export class AgentTaskLeaseLostError extends Error {
  readonly code = "AGENT_WORKER_LEASE_LOST";

  constructor() {
    super("The Agent worker no longer owns the task lease.");
    this.name = "AgentTaskLeaseLostError";
  }
}

export function isAgentTaskLeaseCurrent(
  lease: AgentTaskLease,
  record: AgentTaskLeaseRecord,
  nowMs = Date.now(),
): boolean {
  if (!lease.workerId || !lease.token || !Number.isFinite(nowMs)) return false;
  if (record.worker_id !== lease.workerId || record.lease_token !== lease.token) return false;
  if (typeof record.lease_expires_at !== "string") return false;
  const expiresAt = Date.parse(record.lease_expires_at);
  return Number.isFinite(expiresAt) && expiresAt > nowMs;
}

export function getAgentTaskLeaseRecoveryDisposition(
  status: string,
  cancellationRequestedAt: unknown,
): AgentTaskRecoveryDisposition {
  if (TERMINAL_STATUSES.has(status) || !ACTIVE_STATUSES.has(status)) return null;
  return typeof cancellationRequestedAt === "string" && cancellationRequestedAt.length > 0
    ? "cancelled"
    : "failed";
}
