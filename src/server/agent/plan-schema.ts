import type { AgentPlan, AgentPlanStep, AgentToolCall } from "@/shared/agent/contracts";

export type { AgentPlan, AgentPlanStep, AgentToolCall } from "@/shared/agent/contracts";

export type AgentAvailableTool = {
  id: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  description?: string;
  deviceId?: string;
};

export type PlanParseResult = { ok: true; value: AgentPlan } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function validateArguments(schema: AgentAvailableTool["inputSchema"], args: Record<string, unknown>): boolean {
  if (schema.type !== "object") return false;
  const properties = schema.properties;
  const keys = Object.keys(args);
  if (schema.additionalProperties === false && keys.some((key) => !(key in properties))) return false;

  for (const required of schema.required ?? []) {
    if (!(required in args)) return false;
  }

  for (const [key, value] of Object.entries(args)) {
    const property = properties[key];
    if (!isRecord(property) || typeof property.type !== "string") return false;
    if (property.type === "string") {
      if (typeof value !== "string") return false;
      if (typeof property.maxLength === "number" && value.length > property.maxLength) return false;
      if (typeof property.minLength === "number" && value.length < property.minLength) return false;
    } else if (property.type === "number" || property.type === "integer") {
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      if (property.type === "integer" && !Number.isInteger(value)) return false;
      if (typeof property.minimum === "number" && value < property.minimum) return false;
      if (typeof property.maximum === "number" && value > property.maximum) return false;
    } else if (property.type === "boolean") {
      if (typeof value !== "boolean") return false;
    } else if (property.type === "object") {
      if (!isRecord(value)) return false;
    } else if (property.type === "array") {
      if (!Array.isArray(value)) return false;
    } else {
      return false;
    }
  }

  try {
    return Buffer.byteLength(JSON.stringify(args), "utf8") <= 16000;
  } catch {
    return false;
  }
}

const DEFAULT_TOOLS: AgentAvailableTool[] = [
  {
    id: "text.word_count",
    inputSchema: { type: "object", properties: { text: { type: "string", maxLength: 12000 } }, required: ["text"], additionalProperties: false },
  },
  {
    id: "text.extract_keywords",
    inputSchema: { type: "object", properties: { text: { type: "string", maxLength: 12000 } }, required: ["text"], additionalProperties: false },
  },
  {
    id: "text.text_stats",
    inputSchema: { type: "object", properties: { text: { type: "string", maxLength: 12000 } }, required: ["text"], additionalProperties: false },
  },
];

export function parseAgentPlan(
  value: unknown,
  allowedTools: readonly AgentAvailableTool[] = DEFAULT_TOOLS,
  limits: { maxSteps?: number; maxToolCalls?: number } = {},
): PlanParseResult {
  const maxSteps = limits.maxSteps ?? 8;
  const maxToolCalls = limits.maxToolCalls ?? 4;
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 8 ||
      !Number.isInteger(maxToolCalls) || maxToolCalls < 0 || maxToolCalls > 4) {
    return { ok: false, error: "Agent execution limits are invalid." };
  }
  if (!isRecord(value) || !hasExactKeys(value, ["version", "goal", "steps", "toolCalls"])) {
    return { ok: false, error: "Plan must contain only version, goal, steps, and toolCalls." };
  }
  if (value.version !== 1) return { ok: false, error: "Unsupported plan version." };
  if (typeof value.goal !== "string" || !value.goal.trim() || value.goal.length > 500) {
    return { ok: false, error: "Plan goal must be between 1 and 500 characters." };
  }
  if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > maxSteps) {
    return { ok: false, error: "Plan must contain between 1 and " + maxSteps + " steps." };
  }

  const seen = new Set<string>();
  const steps: AgentPlanStep[] = [];
  for (const raw of value.steps) {
    if (!isRecord(raw) || !hasExactKeys(raw, ["id", "objective", "expectedOutcome"])) {
      return { ok: false, error: "Each step must contain only id, objective, and expectedOutcome." };
    }
    const { id, objective, expectedOutcome } = raw;
    if (typeof id !== "string" || !/^step-[1-8]$/.test(id) || seen.has(id)) {
      return { ok: false, error: "Step IDs must be unique values from step-1 through step-8." };
    }
    if (typeof objective !== "string" || !objective.trim() || objective.length > 500) {
      return { ok: false, error: "Each objective must be between 1 and 500 characters." };
    }
    if (typeof expectedOutcome !== "string" || !expectedOutcome.trim() || expectedOutcome.length > 300) {
      return { ok: false, error: "Each expected outcome must be between 1 and 300 characters." };
    }
    seen.add(id);
    steps.push({ id, objective, expectedOutcome });
  }

  if (!Array.isArray(value.toolCalls) || value.toolCalls.length > maxToolCalls) {
    return { ok: false, error: "Plan may contain at most " + maxToolCalls + " registered tool calls." };
  }
  const callIds = new Set<string>();
  const toolCalls: AgentToolCall[] = [];
  const allowed = new Map(allowedTools.map((tool) => [tool.id, tool]));

  for (const raw of value.toolCalls) {
    if (!isRecord(raw) || !hasExactKeys(raw, ["id", "toolId", "arguments"])) {
      return { ok: false, error: "Tool calls must contain only id, toolId, and arguments." };
    }
    if (typeof raw.id !== "string" || !/^call-[1-4]$/.test(raw.id) || callIds.has(raw.id)) {
      return { ok: false, error: "Tool call IDs must be unique call-1 through call-4." };
    }
    if (typeof raw.toolId !== "string" || !allowed.has(raw.toolId)) {
      return { ok: false, error: "Plan requested a tool that is not currently available." };
    }
    if (!isRecord(raw.arguments) || !validateArguments(allowed.get(raw.toolId)!.inputSchema, raw.arguments)) {
      return { ok: false, error: "Tool arguments failed the registered input schema." };
    }
    callIds.add(raw.id);
    toolCalls.push({ id: raw.id, toolId: raw.toolId, arguments: raw.arguments });
  }

  return { ok: true, value: { version: 1, goal: value.goal, steps, toolCalls } };
}
