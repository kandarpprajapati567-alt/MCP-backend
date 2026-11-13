export type AgentTeamRequest = { task: string; agentIds: string[] };
export type AgentTeamParseResult =
  | { ok: true; value: AgentTeamRequest }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAgentTeamRequest(value: unknown): AgentTeamParseResult {
  if (!isRecord(value)) return { ok: false, error: "A JSON object is required." };
  if (Object.keys(value).some((key) => key !== "task" && key !== "agentIds")) {
    return { ok: false, error: "Team request contains unsupported fields." };
  }
  if (typeof value.task !== "string" || !value.task.trim() || value.task.length > 4000) {
    return { ok: false, error: "Task must be 1–4000 characters." };
  }
  if (!Array.isArray(value.agentIds) || value.agentIds.length < 2 || value.agentIds.length > 3 ||
      value.agentIds.some((id) => typeof id !== "string" || !UUID.test(id)) ||
      new Set(value.agentIds).size !== value.agentIds.length) {
    return { ok: false, error: "Choose 2 or 3 different valid Agent IDs." };
  }
  return { ok: true, value: { task: value.task.trim(), agentIds: value.agentIds as string[] } };
}
