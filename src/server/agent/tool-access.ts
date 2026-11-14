export type AgentToolTarget = "backend" | "remote_mcp" | "device";

export type AgentToolCandidate = {
  id: string;
  description: string;
  permission: string;
  sideEffect: boolean;
  target: AgentToolTarget;
  available?: boolean;
  availabilityNote?: string;
};

export type AgentToolAccessStatus =
  | "assigned"
  | "assignment_required"
  | "unavailable"
  | "assigned_unavailable";

export type AgentToolDenialReason = "not_assigned" | "capability_unavailable";

export type AgentToolAccessEntry = AgentToolCandidate & {
  available: boolean;
  assigned: boolean;
  status: AgentToolAccessStatus;
  assignmentDecision: "allowlisted" | "denied";
  denialReasons: AgentToolDenialReason[];
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
    const denialReasons: AgentToolDenialReason[] = [];
    if (!isAssigned) denialReasons.push("not_assigned");
    if (!available) denialReasons.push("capability_unavailable");
    tools.push({
      ...candidate,
      available,
      assigned: isAssigned,
      status: !available
        ? isAssigned ? "assigned_unavailable" : "unavailable"
        : isAssigned ? "assigned" : "assignment_required",
      assignmentDecision: isAssigned && available ? "allowlisted" : "denied",
      denialReasons,
      risk: candidate.sideEffect ? "side_effect" : "read_only",
    });
  }

  const unavailableAssignments = [...assigned].filter((id) => !seen.has(id));
  const allowlisted = tools.filter((tool) => tool.assigned && tool.available).length;
  const unavailable = tools.filter((tool) => !tool.available).length + unavailableAssignments.length;

  return {
    tools,
    unavailableAssignments,
    summary: {
      total: tools.length + unavailableAssignments.length,
      assigned: assigned.size,
      available: tools.filter((tool) => tool.available).length,
      allowlisted,
      denied: tools.length + unavailableAssignments.length - allowlisted,
      assignmentRequired: tools.filter((tool) => tool.available && !tool.assigned).length,
      unavailable,
      assignedUnavailable: tools.filter((tool) => tool.assigned && !tool.available).length + unavailableAssignments.length,
    },
  };
}
