export type AgentTeamMemberRequest = { agentId: string; task: string };
export type AgentTeamRequest = { members: AgentTeamMemberRequest[] };
export type AgentTeamParseResult =
  | { ok: true; value: AgentTeamRequest }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAgentTeamRequest(value: unknown): AgentTeamParseResult {
  if (!isRecord(value)) return { ok: false, error: "A JSON object is required." };
  if (Object.keys(value).some((key) => key !== "members")) {
    return { ok: false, error: "Team request contains unsupported fields." };
  }
  if (!Array.isArray(value.members) || value.members.length < 2 || value.members.length > 3) {
    return { ok: false, error: "A team must contain 2 or 3 specialist assignments." };
  }
  const members: AgentTeamMemberRequest[] = [];
  const seen = new Set<string>();
  for (const member of value.members) {
    if (!isRecord(member) || Object.keys(member).some((key) => key !== "agentId" && key !== "task") ||
        typeof member.agentId !== "string" || !UUID.test(member.agentId) || seen.has(member.agentId)) {
      return { ok: false, error: "Each team member must have a unique valid Agent ID and one task." };
    }
    if (typeof member.task !== "string" || !member.task.trim() || member.task.length > 4000) {
      return { ok: false, error: "Each Agent task must be 1–4000 characters." };
    }
    seen.add(member.agentId);
    members.push({ agentId: member.agentId, task: member.task.trim() });
  }
  return { ok: true, value: { members } };
}
