export type AgentToolTarget = "backend" | "remote_mcp" | "device";

export type AgentToolCandidate = {
  id: string;
  description: string;
  permission: string;
  sideEffect: boolean;
  target: AgentToolTarget;
  available?: boolean;
};

export type AgentToolAccessStatus =
  | "assigned"
  | "assignment_required"
  | "unavailable"
  | "assigned_unavailable";

export type AgentToolAccessEntry = AgentToolCandidate & {
  available: boolean;
  status: AgentToolAccessStatus;
  risk: "read_only" | "side_effect";
};

export function buildAgentToolAccessReport(
  candidates: readonly AgentToolCandidate[],
  allowedTools: readonly string[],
) {
  const assigned = new Set(allowedTools.filter((id) => typeof id === "string" && id.length > 0));
  const seen = new Set<string>();
  const tools: AgentToolAccessEntry[] = [];

  for (const candidate of candidates) {
    if (!candidate.id || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const available = candidate.available !== false;
    const isAssigned = assigned.has(candidate.id);
    tools.push({
      ...candidate,
      available,
      status: !available
        ? isAssigned ? "assigned_unavailable" : "unavailable"
        : isAssigned ? "assigned" : "assignment_required",
      risk: candidate.sideEffect ? "side_effect" : "read_only",
    });
  }

  const unavailableAssignments = [...assigned].filter((id) => !seen.has(id));
  return {
    tools,
    unavailableAssignments,
    summary: {
      total: tools.length,
      assigned: tools.filter((tool) => tool.status === "assigned").length,
      assignmentRequired: tools.filter((tool) => tool.status === "assignment_required").length,
      unavailable: tools.filter((tool) => tool.status === "unavailable").length + unavailableAssignments.length,
      assignedUnavailable: tools.filter((tool) => tool.status === "assigned_unavailable").length + unavailableAssignments.length,
    },
  };
}
