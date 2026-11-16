export type AgentTeamMemberState = { status: string };

export type AgentTeamSummary = {
  status: "queued" | "running" | "completed" | "partial" | "failed";
  total: number;
  completed: number;
  failed: number;
  pending: number;
};

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export function summarizeAgentTeamMembers(members: readonly AgentTeamMemberState[]): AgentTeamSummary {
  const completed = members.filter((member) => member.status === "completed").length;
  const failed = members.filter((member) => member.status === "failed" || member.status === "cancelled").length;
  const pending = members.length - completed - failed;
  const status = !members.length || (failed === members.length) ? "failed"
    : pending > 0 ? (members.every((member) => member.status === "queued") ? "queued" : "running")
      : failed > 0 ? "partial" : "completed";
  return { status, total: members.length, completed, failed, pending };
}

export function isAgentTeamTerminal(status: string): boolean {
  return status === "completed" || status === "partial" || status === "failed" ||
    (TERMINAL.has(status));
}
