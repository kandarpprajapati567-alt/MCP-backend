export type AgentTeamMemberState = {
  status: string;
  completionVerdict?: string;
  goalVerdict?: string;
  evidenceCount?: number;
  errorCode?: string;
};

export type AgentTeamSummary = {
  status: "queued" | "running" | "completed" | "partial" | "needs_review" | "failed";
  total: number;
  completed: number;
  partial: number;
  needsReview: number;
  failed: number;
  pending: number;
};

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

function isVerifiedMember(member: AgentTeamMemberState): boolean {
  return member.status === "completed" &&
    member.completionVerdict === "execution_complete" &&
    member.goalVerdict === "criteria_covered" &&
    Number.isInteger(member.evidenceCount) &&
    (member.evidenceCount ?? 0) > 0;
}

export function summarizeAgentTeamMembers(members: readonly AgentTeamMemberState[]): AgentTeamSummary {
  const completed = members.filter(isVerifiedMember).length;
  const completionRejected = (member: AgentTeamMemberState) =>
    member.status === "failed" && member.errorCode === "AGENT_COMPLETION_UNVERIFIED";
  const failed = members.filter((member) =>
    (member.status === "failed" && !completionRejected(member)) || member.status === "cancelled").length;
  const partial = members.filter((member) =>
    (member.status === "completed" || completionRejected(member)) &&
    (member.completionVerdict === "partial" || member.goalVerdict === "partial")).length;
  const needsReview = members.filter((member) =>
    (member.status === "completed" || completionRejected(member)) &&
    !isVerifiedMember(member) &&
    member.completionVerdict !== "partial" &&
    member.goalVerdict !== "partial").length;
  const pending = members.filter((member) => !TERMINAL.has(member.status)).length;
  const status = !members.length ? "failed"
    : pending > 0 ? (members.every((member) => ["queued", "planning"].includes(member.status)) ? "queued" : "running")
      : completed === members.length ? "completed"
        : completed > 0 ? "partial"
          : needsReview > 0 && partial === 0 && failed === 0 ? "needs_review"
            : partial > 0 ? "partial"
              : needsReview > 0 ? "needs_review" : "failed";
  return { status, total: members.length, completed, partial, needsReview, failed, pending };
}

export function isAgentTeamTerminal(status: string): boolean {
  return status === "completed" || status === "partial" || status === "needs_review" || status === "failed" ||
    (TERMINAL.has(status));
}
