export type AgentTeamMemberState = {
  status: string;
  completionEvaluation?: { verdict?: string } | null;
  goalEvaluation?: { verdict?: string } | null;
};

export type AgentTeamSummary = {
  status: "queued" | "running" | "completed" | "partial" | "failed";
  total: number;
  completed: number;
  partial: number;
  needsReview: number;
  failed: number;
  pending: number;
};

const TERMINAL = new Set(["completed", "partial", "needs_review", "failed", "cancelled"]);

function memberOutcome(member: AgentTeamMemberState): "completed" | "partial" | "needs_review" | "failed" | "pending" {
  if (member.status === "failed" || member.status === "cancelled") return "failed";
  if (member.status === "partial" || member.completionEvaluation?.verdict === "partial" || member.goalEvaluation?.verdict === "partial") return "partial";
  if (member.status === "needs_review" || member.completionEvaluation?.verdict === "needs_review" ||
      member.goalEvaluation?.verdict === "needs_review") return "needs_review";
  if (member.status === "completed") {
    return member.completionEvaluation?.verdict === "execution_complete" &&
      member.goalEvaluation?.verdict === "criteria_covered" ? "completed" : "needs_review";
  }
  return "pending";
}

export function summarizeAgentTeamMembers(members: readonly AgentTeamMemberState[]): AgentTeamSummary {
  const outcomes = members.map(memberOutcome);
  const completed = outcomes.filter((status) => status === "completed").length;
  const partial = outcomes.filter((status) => status === "partial").length;
  const needsReview = outcomes.filter((status) => status === "needs_review").length;
  const failed = outcomes.filter((status) => status === "failed").length;
  const pending = outcomes.filter((status) => status === "pending").length;
  const status = !members.length || failed === members.length ? "failed"
    : pending > 0 ? (members.every((member) => member.status === "queued") ? "queued" : "running")
      : partial + needsReview + failed > 0 ? "partial" : "completed";
  return { status, total: members.length, completed, partial, needsReview, failed, pending };
}

export function isAgentTeamTerminal(status: string): boolean {
  return TERMINAL.has(status);
}
