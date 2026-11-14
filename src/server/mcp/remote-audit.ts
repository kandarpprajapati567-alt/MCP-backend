import { createHash } from "node:crypto";

export type RemoteMcpAuditSource = "agent_task" | "mcp_direct" | "unknown";
export type RemoteMcpInvocationContext = {
  source: RemoteMcpAuditSource;
  taskId?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AUDIT_OUTPUT_BYTES = 98_304;
const MAX_CONTENT_JSON_BYTES = 80_000;
const MAX_CONTENT_ITEMS = 12;
const MAX_CONTENT_ITEM_JSON_BYTES = 6_500;

function boundedInteger(value: number, maximum: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(maximum, Math.floor(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    output_bytes: boundedInteger(input.outputBytes, MAX_AUDIT_OUTPUT_BYTES),
    content_items: boundedInteger(input.contentItems, MAX_CONTENT_ITEMS),
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

function truncateUtf8(value: string, maximumBytes: number): string {
  let output = "";
  let used = 0;
  for (const character of value) {
    const bytes = Buffer.byteLength(character, "utf8");
    if (used + bytes > maximumBytes) break;
    output += character;
    used += bytes;
  }
  return output;
}

function boundedTextItem(value: string): string {
  let output = truncateUtf8(value, 6_000);
  while (output && Buffer.byteLength(JSON.stringify({ type: "text", text: output }), "utf8") > MAX_CONTENT_ITEM_JSON_BYTES) {
    output = truncateUtf8(output, Math.floor(Buffer.byteLength(output, "utf8") * 0.7));
  }
  return output;
}

/** Keeps remote text output within a predictable serialized JSON byte budget. */
export function boundRemoteMcpContent(value: unknown): Array<{ type: string; text: string }> {
  if (!Array.isArray(value)) return [];
  const bounded: Array<{ type: string; text: string }> = [];
  for (const raw of value.slice(0, MAX_CONTENT_ITEMS)) {
    let item: { type: string; text: string };
    if (!isRecord(raw)) {
      item = { type: "text", text: "[Unsupported remote content]" };
    } else if (raw.type === "text" && typeof raw.text === "string") {
      item = { type: "text", text: boundedTextItem(raw.text) };
    } else {
      item = {
        type: typeof raw.type === "string" ? raw.type.slice(0, 40) : "unknown",
        text: "[Non-text content omitted]",
      };
    }
    const candidate = [...bounded, item];
    if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > MAX_CONTENT_JSON_BYTES) break;
    bounded.push(item);
  }
  return bounded;
}

export type RemoteMcpAuditMetrics = {
  responseBytes: number;
  outputBytes: number;
  contentItems: number;
};

export type RemoteMcpAuditPersistence = {
  start(record: ReturnType<typeof buildRemoteMcpAuditStartRecord>): Promise<void>;
  complete(patch: ReturnType<typeof buildRemoteMcpAuditCompletedPatch>): Promise<void>;
  fail(patch: ReturnType<typeof buildRemoteMcpAuditFailedPatch>): Promise<void>;
  pending(patch: ReturnType<typeof buildRemoteMcpAuditPendingPatch>): Promise<void>;
};

/**
 * Audit start is mandatory before network invocation. Failed calls are recorded
 * without raw error text; successful calls are not returned until finalization
 * is confirmed. A failed final write is marked audit_pending when possible.
 */
export async function runRemoteMcpAuditedInvocation<T>(
  input: {
    id: string;
    ownerId: string;
    serverId: string;
    toolId: string;
    toolName: string;
    source: RemoteMcpAuditSource;
    taskId?: string;
    args: Record<string, unknown>;
    startedAt: string;
  },
  persistence: RemoteMcpAuditPersistence,
  execute: () => Promise<{ value: T } & RemoteMcpAuditMetrics>,
): Promise<T> {
  await persistence.start(buildRemoteMcpAuditStartRecord(input));
  const startedAt = Date.parse(input.startedAt);
  const duration = () => Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : 0;

  let execution: { value: T } & RemoteMcpAuditMetrics;
  try {
    execution = await execute();
  } catch (error) {
    try {
      await persistence.fail({
        ...buildRemoteMcpAuditFailedPatch({
          completedAt: new Date().toISOString(),
          durationMs: duration(),
          error,
        }),
      });
    } catch {
      // The initial "started" row remains as evidence if failure finalization is unavailable.
    }
    throw error;
  }

  const completedAt = new Date().toISOString();
  try {
    await persistence.complete(buildRemoteMcpAuditCompletedPatch({
      completedAt,
      durationMs: duration(),
      responseBytes: execution.responseBytes,
      outputBytes: execution.outputBytes,
      contentItems: execution.contentItems,
    }));
  } catch {
    try {
      await persistence.pending(buildRemoteMcpAuditPendingPatch({ completedAt, durationMs: duration() }));
    } catch {
      // The initial "started" row remains visible if both final writes fail.
    }
    throw new Error("Remote MCP invocation completed, but its audit outcome could not be confirmed.");
  }

  return execution.value;
}
