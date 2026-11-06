export type AgentPermission =
  | "READ_PROJECT"
  | "WRITE_PROJECT"
  | "NETWORK_ACCESS"
  | "DEVICE_ACCESS"
  | "EXTERNAL_SIDE_EFFECT";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface JsonObjectSchema {
  type: "object";
  properties: Readonly<Record<string, {
    type: "string" | "number" | "integer" | "boolean";
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    enum?: readonly (string | number | boolean)[];
  }>>;
  required: readonly string[];
  additionalProperties: false;
}

export interface AgentToolContext {
  userId: string;
  taskId: string;
  signal: AbortSignal;
}

export interface AgentToolDefinition {
  id: string;
  description: string;
  inputSchema: JsonObjectSchema;
  requiredPermissions: readonly AgentPermission[];
  /** Sensitive or externally visible actions must wait for explicit approval. */
  requiresApproval: boolean;
  timeoutMs: number;
  maxOutputBytes: number;
  execute(input: Record<string, JsonValue>, context: AgentToolContext): Promise<unknown>;
}

export type ToolExecutionResult =
  | { status: "completed"; toolId: string; output: JsonValue }
  | { status: "awaiting_approval"; toolId: string; requiredPermissions: AgentPermission[] }
  | { status: "permission_denied"; toolId: string; missingPermissions: AgentPermission[] }
  | { status: "failed"; toolId: string; code: "INVALID_ARGUMENTS" | "TIMEOUT" | "TOOL_FAILED" | "INVALID_OUTPUT" };
