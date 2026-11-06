import "server-only";

import type { AgentPermission, AgentToolContext, AgentToolDefinition, JsonValue, ToolExecutionResult } from "./tool-contract";
import { AgentToolRegistry } from "./tool-registry";

const encoder = new TextEncoder();

function validateArguments(tool: AgentToolDefinition, input: unknown): input is Record<string, JsonValue> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  const schema = tool.inputSchema;
  if (Object.keys(value).some((key) => !(key in schema.properties))) return false;
  if (schema.required.some((key) => !(key in value))) return false;

  for (const [key, raw] of Object.entries(value)) {
    const rule = schema.properties[key];
    if (!rule) return false;
    if (rule.type === "string") {
      if (typeof raw !== "string") return false;
      if (rule.minLength !== undefined && raw.length < rule.minLength) return false;
      if (rule.maxLength !== undefined && raw.length > rule.maxLength) return false;
    } else if (rule.type === "number" || rule.type === "integer") {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return false;
      if (rule.type === "integer" && !Number.isInteger(raw)) return false;
      if (rule.minimum !== undefined && raw < rule.minimum) return false;
      if (rule.maximum !== undefined && raw > rule.maximum) return false;
    } else if (typeof raw !== "boolean") {
      return false;
    }
    if (rule.enum && !rule.enum.includes(raw as string | number | boolean)) return false;
  }
  return true;
}

function normalizeOutput(value: unknown, maxBytes: number): JsonValue | undefined {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return undefined;
  }
  if (serialized === undefined || encoder.encode(serialized).byteLength > maxBytes) return undefined;
  try {
    return JSON.parse(serialized) as JsonValue;
  } catch {
    return undefined;
  }
}

export async function executeRegisteredTool(args: {
  registry: AgentToolRegistry;
  toolId: string;
  input: unknown;
  context: Omit<AgentToolContext, "signal">;
  grantedPermissions: readonly AgentPermission[];
  approvedToolIds?: readonly string[];
}): Promise<ToolExecutionResult> {
  const tool = args.registry.get(args.toolId);
  if (!tool) return { status: "failed", toolId: args.toolId, code: "TOOL_FAILED" };
  if (!validateArguments(tool, args.input)) {
    return { status: "failed", toolId: tool.id, code: "INVALID_ARGUMENTS" };
  }

  const granted = new Set(args.grantedPermissions);
  const missingPermissions = tool.requiredPermissions.filter((permission) => !granted.has(permission));
  if (missingPermissions.length > 0) {
    return { status: "permission_denied", toolId: tool.id, missingPermissions };
  }
  if (tool.requiresApproval && !args.approvedToolIds?.includes(tool.id)) {
    return { status: "awaiting_approval", toolId: tool.id, requiredPermissions: [...tool.requiredPermissions] };
  }

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const execution = tool.execute(args.input, { ...args.context, signal: controller.signal });
    const timeoutResult = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("TOOL_TIMEOUT"));
      }, tool.timeoutMs);
    });
    const rawOutput = await Promise.race([execution, timeoutResult]);
    const output = normalizeOutput(rawOutput, tool.maxOutputBytes);
    if (output === undefined) return { status: "failed", toolId: tool.id, code: "INVALID_OUTPUT" };
    return { status: "completed", toolId: tool.id, output };
  } catch (error) {
    if (error instanceof Error && error.message === "TOOL_TIMEOUT") {
      return { status: "failed", toolId: tool.id, code: "TIMEOUT" };
    }
    return { status: "failed", toolId: tool.id, code: "TOOL_FAILED" };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
