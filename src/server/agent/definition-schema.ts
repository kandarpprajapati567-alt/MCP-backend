export const AGENT_PROVIDERS = ["auto", "openai", "openrouter", "mock"] as const;
export type AgentProviderPreference = (typeof AGENT_PROVIDERS)[number];

export type AgentDefinitionInput = {
  name: string;
  description: string;
  role: string;
  instructions: string;
  providerPreference: AgentProviderPreference;
  modelPreference: string | null;
  allowedTools: string[];
  maxSteps: number;
  maxToolCalls: number;
  enabled: boolean;
};

export type AgentDefinitionParseResult =
  | { ok: true; value: AgentDefinitionInput }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAgentDefinition(value: unknown): AgentDefinitionParseResult {
  if (!isRecord(value)) return { ok: false, error: "A JSON object is required." };

  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description = value.description === undefined ? "" : value.description;
  const role = typeof value.role === "string" ? value.role.trim() : "";
  const instructions = typeof value.instructions === "string" ? value.instructions.trim() : "";
  const providerPreference = value.providerPreference === undefined ? "auto" : value.providerPreference;
  const modelPreference = value.modelPreference === undefined || value.modelPreference === null
    ? null : value.modelPreference;
  const allowedTools = value.allowedTools === undefined ? [] : value.allowedTools;
  const maxSteps = value.maxSteps === undefined ? 8 : value.maxSteps;
  const maxToolCalls = value.maxToolCalls === undefined ? 4 : value.maxToolCalls;
  const enabled = value.enabled === undefined ? true : value.enabled;

  if (name.length < 1 || name.length > 80) return { ok: false, error: "name must be 1–80 characters." };
  if (typeof description !== "string" || description.length > 500) return { ok: false, error: "description must be at most 500 characters." };
  if (role.length < 1 || role.length > 120) return { ok: false, error: "role must be 1–120 characters." };
  if (instructions.length < 1 || instructions.length > 12000) return { ok: false, error: "instructions must be 1–12000 characters." };
  if (typeof providerPreference !== "string" || !AGENT_PROVIDERS.includes(providerPreference as AgentProviderPreference)) {
    return { ok: false, error: "Unsupported provider preference." };
  }
  if (modelPreference !== null && (typeof modelPreference !== "string" || modelPreference.trim().length < 1 || modelPreference.length > 160)) {
    return { ok: false, error: "modelPreference must be null or 1–160 characters." };
  }
  if (!Array.isArray(allowedTools) || allowedTools.length > 40 ||
      allowedTools.some((tool) => typeof tool !== "string" || !/^[a-zA-Z0-9._-]{1,160}$/.test(tool)) ||
      new Set(allowedTools).size !== allowedTools.length) {
    return { ok: false, error: "allowedTools must contain up to 40 unique tool IDs." };
  }
  if (typeof maxSteps !== "number" || !Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 8) {
    return { ok: false, error: "maxSteps must be an integer from 1 to 8." };
  }
  if (typeof maxToolCalls !== "number" || !Number.isInteger(maxToolCalls) || maxToolCalls < 0 || maxToolCalls > 4) {
    return { ok: false, error: "maxToolCalls must be an integer from 0 to 4." };
  }
  if (typeof enabled !== "boolean") return { ok: false, error: "enabled must be boolean." };

  return {
    ok: true,
    value: {
      name,
      description: description.trim(),
      role,
      instructions,
      providerPreference: providerPreference as AgentProviderPreference,
      modelPreference: typeof modelPreference === "string" ? modelPreference.trim() : null,
      allowedTools: allowedTools as string[],
      maxSteps,
      maxToolCalls,
      enabled,
    },
  };
}
