import { AGENT_PROVIDERS, type AgentProviderPreference } from "@/server/agent/definition-schema";

export type BotDefinitionInput = {
  name: string;
  description: string;
  personaInstructions: string;
  agentIds: string[];
  defaultAgentId: string | null;
  providerPreference: AgentProviderPreference;
  modelPreference: string | null;
  allowedTools: string[];
  enabled: boolean;
};

export type BotDefinitionParseResult =
  | { ok: true; value: BotDefinitionInput }
  | { ok: false; error: string };

const fields = new Set([
  "name", "description", "personaInstructions", "agentIds", "defaultAgentId",
  "providerPreference", "modelPreference", "allowedTools", "enabled",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseBotDefinition(value: unknown): BotDefinitionParseResult {
  if (!isRecord(value)) return { ok: false, error: "A JSON object is required." };
  if (Object.keys(value).some((key) => !fields.has(key))) {
    return { ok: false, error: "Bot definition contains unsupported fields." };
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description = value.description === undefined ? "" : value.description;
  const personaInstructions = typeof value.personaInstructions === "string" ? value.personaInstructions.trim() : "";
  const agentIds = value.agentIds === undefined ? [] : value.agentIds;
  const defaultAgentId = value.defaultAgentId === undefined || value.defaultAgentId === null ? null : value.defaultAgentId;
  const providerPreference = value.providerPreference === undefined ? "auto" : value.providerPreference;
  const modelPreference = value.modelPreference === undefined || value.modelPreference === null ? null : value.modelPreference;
  const allowedTools = value.allowedTools === undefined ? [] : value.allowedTools;
  const enabled = value.enabled === undefined ? true : value.enabled;

  if (name.length < 1 || name.length > 80) return { ok: false, error: "name must be 1–80 characters." };
  if (typeof description !== "string" || description.length > 500) return { ok: false, error: "description must be at most 500 characters." };
  if (personaInstructions.length < 1 || personaInstructions.length > 12000) return { ok: false, error: "personaInstructions must be 1–12000 characters." };
  if (!Array.isArray(agentIds) || agentIds.length < 1 || agentIds.length > 20 ||
      agentIds.some((id) => typeof id !== "string" || !uuid.test(id)) ||
      new Set(agentIds).size !== agentIds.length) {
    return { ok: false, error: "agentIds must contain 1–20 unique Agent UUIDs." };
  }
  if (defaultAgentId !== null && (typeof defaultAgentId !== "string" || !uuid.test(defaultAgentId) || !agentIds.includes(defaultAgentId))) {
    return { ok: false, error: "defaultAgentId must be one of the assigned Agents." };
  }
  if (typeof providerPreference !== "string" || !AGENT_PROVIDERS.includes(providerPreference as AgentProviderPreference)) {
    return { ok: false, error: "Unsupported provider preference." };
  }
  if (modelPreference !== null && (typeof modelPreference !== "string" || !modelPreference.trim() || modelPreference.length > 160)) {
    return { ok: false, error: "modelPreference must be null or 1–160 characters." };
  }
  if (!Array.isArray(allowedTools) || allowedTools.length > 40 ||
      allowedTools.some((tool) => typeof tool !== "string" || !/^[a-zA-Z0-9._-]{1,160}$/.test(tool)) ||
      new Set(allowedTools).size !== allowedTools.length) {
    return { ok: false, error: "allowedTools must contain up to 40 unique tool IDs." };
  }
  if (typeof enabled !== "boolean") return { ok: false, error: "enabled must be boolean." };

  return {
    ok: true,
    value: {
      name,
      description: description.trim(),
      personaInstructions,
      agentIds: agentIds as string[],
      defaultAgentId: defaultAgentId as string | null,
      providerPreference: providerPreference as AgentProviderPreference,
      modelPreference: typeof modelPreference === "string" ? modelPreference.trim() : null,
      allowedTools: allowedTools as string[],
      enabled,
    },
  };
}
