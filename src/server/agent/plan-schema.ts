export interface AgentPlanStep {
  id: string;
  objective: string;
  expectedOutcome: string;
}

export interface AgentToolCall {
  id: string;
  toolId: string;
  arguments: Record<string, unknown>;
}

export interface AgentPlan {
  version: 1;
  goal: string;
  steps: AgentPlanStep[];
  toolCalls: AgentToolCall[];
}

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

const MAX_SCHEMA_DEPTH = 8;

function validateSchemaValue(schema: unknown, value: unknown, depth = 0): boolean {
  if (!isRecord(schema) || typeof schema.type !== "string" || depth > MAX_SCHEMA_DEPTH) return false;

  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.some((candidate) =>
    JSON.stringify(candidate) === JSON.stringify(value)))) return false;

  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") return false;
      if (schema.minLength !== undefined && (typeof schema.minLength !== "number" || !Number.isInteger(schema.minLength) || schema.minLength < 0)) return false;
      if (schema.maxLength !== undefined && (typeof schema.maxLength !== "number" || !Number.isInteger(schema.maxLength) || schema.maxLength < 0)) return false;
      if (typeof schema.minLength === "number" && typeof schema.maxLength === "number" && schema.minLength > schema.maxLength) return false;
      if (typeof schema.minLength === "number" && value.length < schema.minLength) return false;
      if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return false;
      return true;
    }
    case "number":
    case "integer": {
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      if (schema.type === "integer" && !Number.isInteger(value)) return false;
      if (schema.minimum !== undefined && (typeof schema.minimum !== "number" || !Number.isFinite(schema.minimum))) return false;
      if (schema.maximum !== undefined && (typeof schema.maximum !== "number" || !Number.isFinite(schema.maximum))) return false;
      if (typeof schema.minimum === "number" && typeof schema.maximum === "number" && schema.minimum > schema.maximum) return false;
      if (typeof schema.minimum === "number" && value < schema.minimum) return false;
      if (typeof schema.maximum === "number" && value > schema.maximum) return false;
      return true;
    }
    case "boolean":
      return typeof value === "boolean";
    case "object": {
      if (!isRecord(value)) return false;
      const properties = isRecord(schema.properties) ? schema.properties : {};
      const keys = Object.keys(value);
      if (schema.additionalProperties === false && keys.some((key) => !(key in properties))) return false;
      if (typeof schema.minProperties === "number" && keys.length < schema.minProperties) return false;
      if (typeof schema.maxProperties === "number" && keys.length > schema.maxProperties) return false;
      if (schema.required !== undefined && !Array.isArray(schema.required)) return false;
      const required = Array.isArray(schema.required) ? schema.required : [];
      if (required.some((key) => typeof key !== "string" || !(key in value))) return false;
      if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean" &&
          !isRecord(schema.additionalProperties)) return false;
      return Object.entries(value).every(([key, child]) => {
        if (Object.prototype.hasOwnProperty.call(properties, key)) {
          return validateSchemaValue(properties[key], child, depth + 1);
        }
        if (schema.additionalProperties === false) return false;
        if (isRecord(schema.additionalProperties)) {
          return validateSchemaValue(schema.additionalProperties, child, depth + 1);
        }
        return true;
      });
    }
    case "array": {
      if (!Array.isArray(value)) return false;
      if (schema.minItems !== undefined && (!Number.isInteger(schema.minItems) || (schema.minItems as number) < 0)) return false;
      if (schema.maxItems !== undefined && (!Number.isInteger(schema.maxItems) || (schema.maxItems as number) < 0)) return false;
      if (typeof schema.minItems === "number" && typeof schema.maxItems === "number" && schema.minItems > schema.maxItems) return false;
      if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
      if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
      if (schema.items === undefined) return true;
      return value.every((item) => validateSchemaValue(schema.items, item, depth + 1));
    }
    default:
      return false;
  }
}

function validateArguments(schema: AgentAvailableTool["inputSchema"], args: Record<string, unknown>): boolean {
  if (schema.type !== "object" || !validateSchemaValue(schema, args)) return false;
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
