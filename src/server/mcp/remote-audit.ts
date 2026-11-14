import { createHash } from "node:crypto";

export type RemoteMcpAuditSource = "agent_task" | "mcp_direct" | "unknown";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedInteger(value: number, maximum: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(maximum, Math.floor(value)));
}

export function buildRemoteMcpAuditStartRecord(input: {
  id: string;
  ownerId: string;
  serverId: string;
  toolId: string;
  toolName: string;
  source: RemoteMcpAuditSource;
  taskId?: string;
  args: Record<string, unknown>;
  startedAt: string;
}) {
  const serialized = JSON.stringify(input.args);
  if (typeof serialized !== "string") throw new Error("Remote MCP arguments could not be fingerprinted.");
  return {
    id: input.id,
    owner_id: input.ownerId,
    server_id: input.serverId,
    task_id: input.taskId && UUID_PATTERN.test(input.taskId) ? input.taskId : null,
    tool_id: input.toolId.slice(0, 200),
    tool_name: input.toolName.slice(0, 80),
    source: input.source,
    argument_digest: createHash("sha256").update(serialized, "utf8").digest("hex"),
    status: "started" as const,
    started_at: input.startedAt,
  };
}

export function classifyRemoteMcpFailure(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/timed out|timeout/.test(message)) return "REMOTE_MCP_TIMEOUT";
  if (/dns|hostname|resolve|public ipv4/.test(message)) return "REMOTE_MCP_DNS_REJECTED";
  if (/redirect/.test(message)) return "REMOTE_MCP_REDIRECT_REJECTED";
  if (/disabled|not connected|not found|not registered/.test(message)) return "REMOTE_MCP_NOT_AVAILABLE";
  if (/argument|schema|invalid tool|tool identifier|json-rpc/.test(message)) return "REMOTE_MCP_VALIDATION_FAILED";
  if (/http \d{3}/.test(message)) return "REMOTE_MCP_HTTP_ERROR";
  return "REMOTE_MCP_FAILED";
}

export function buildRemoteMcpAuditCompletedPatch(input: {
  completedAt: string;
  durationMs: number;
  responseBytes: number;
  outputBytes: number;
  contentItems: number;
}) {
  return {
    status: "completed" as const,
    completed_at: input.completedAt,
    duration_ms: boundedInteger(input.durationMs, 120_000),
    response_bytes: boundedInteger(input.responseBytes, 1_048_576),
    output_bytes: boundedInteger(input.outputBytes, 98_304),
    content_items: boundedInteger(input.contentItems, 12),
    error_code: null,
  };
}

export function buildRemoteMcpAuditFailedPatch(input: {
  completedAt: string;
  durationMs: number;
  error: unknown;
}) {
  return {
    status: "failed" as const,
    completed_at: input.completedAt,
    duration_ms: boundedInteger(input.durationMs, 120_000),
    error_code: classifyRemoteMcpFailure(input.error),
  };
}

export function buildRemoteMcpAuditPendingPatch(input: {
  completedAt: string;
  durationMs: number;
}) {
  return {
    status: "audit_pending" as const,
    completed_at: input.completedAt,
    duration_ms: boundedInteger(input.durationMs, 120_000),
    error_code: "AUDIT_FINALIZATION_FAILED",
  };
}
