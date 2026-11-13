export type AgentToolPolicyTarget = "backend" | "remote_mcp" | "device";

export type AgentToolPolicyDescriptor = {
  id: string;
  permission: string;
  sideEffect: boolean;
  target: AgentToolPolicyTarget;
};

export type AgentToolPolicyDecision =
  | { allowed: true; mode: "agent_allowlist" | "default_read_only" }
  | { allowed: false; reason: "tool_not_registered" | "permission_metadata_missing" | "tool_not_assigned" | "default_read_only_only" };

export function evaluateAgentToolPolicy(
  tool: AgentToolPolicyDescriptor | undefined,
  agentAllowedTools: readonly string[] | null,
): AgentToolPolicyDecision {
  if (!tool) return { allowed: false, reason: "tool_not_registered" };
  if (typeof tool.permission !== "string" || !tool.permission.trim()) {
    return { allowed: false, reason: "permission_metadata_missing" };
  }

  if (agentAllowedTools !== null) {
    return agentAllowedTools.includes(tool.id)
      ? { allowed: true, mode: "agent_allowlist" }
      : { allowed: false, reason: "tool_not_assigned" };
  }

  if (tool.target === "device" || tool.sideEffect) {
    return { allowed: false, reason: "default_read_only_only" };
  }
  return { allowed: true, mode: "default_read_only" };
}
