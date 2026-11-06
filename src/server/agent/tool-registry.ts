import "server-only";

import type { AgentToolDefinition } from "./tool-contract";

const TOOL_ID_PATTERN = /^[a-z][a-z0-9_.-]{1,63}$/;
const MAX_TOOL_TIMEOUT_MS = 30_000;
const MAX_TOOL_OUTPUT_BYTES = 64 * 1024;

/**
 * Code-owned allow-list. Never populate this registry from model output,
 * user metadata, remote URLs, or arbitrary executable code.
 */
export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentToolDefinition>();

  register(tool: AgentToolDefinition): void {
    if (!TOOL_ID_PATTERN.test(tool.id)) throw new Error("Invalid tool ID.");
    if (this.tools.has(tool.id)) throw new Error("Tool ID is already registered.");
    if (!tool.description.trim() || tool.description.length > 500) {
      throw new Error("Tool description must be between 1 and 500 characters.");
    }
    if (!Number.isInteger(tool.timeoutMs) || tool.timeoutMs < 1 || tool.timeoutMs > MAX_TOOL_TIMEOUT_MS) {
      throw new Error("Tool timeout is outside the allowed range.");
    }
    if (!Number.isInteger(tool.maxOutputBytes) || tool.maxOutputBytes < 1 || tool.maxOutputBytes > MAX_TOOL_OUTPUT_BYTES) {
      throw new Error("Tool output limit is outside the allowed range.");
    }
    if (tool.inputSchema.type !== "object" || tool.inputSchema.additionalProperties !== false) {
      throw new Error("Tools must use a closed object input schema.");
    }
    const propertyNames = Object.keys(tool.inputSchema.properties);
    if (tool.inputSchema.required.some((key) => !propertyNames.includes(key))) {
      throw new Error("Required tool arguments must be declared properties.");
    }
    this.tools.set(tool.id, Object.freeze({ ...tool }));
  }

  get(toolId: string): AgentToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  list(): Array<Pick<AgentToolDefinition, "id" | "description" | "inputSchema" | "requiredPermissions" | "requiresApproval">> {
    return [...this.tools.values()].map(({ id, description, inputSchema, requiredPermissions, requiresApproval }) => ({
      id, description, inputSchema, requiredPermissions, requiresApproval,
    }));
  }
}
