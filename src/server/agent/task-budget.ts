export type AgentTaskBudgetInput = { maxSteps?: number; maxToolCalls?: number };
export type AgentTaskBudget = Readonly<{
  maxSteps: number;
  maxToolCalls: number;
  maxExecutionMs: number;
  maxToolResultBytes: number;
  maxTotalToolResultBytes: number;
  maxSynthesisTokens: number;
}>;

export const DEFAULT_AGENT_TASK_BUDGET: AgentTaskBudget = Object.freeze({
  maxSteps: 8,
  maxToolCalls: 4,
  maxExecutionMs: 180_000,
  maxToolResultBytes: 16_384,
  maxTotalToolResultBytes: 49_152,
  maxSynthesisTokens: 1_800,
});

export class AgentTaskBudgetExceededError extends Error {
  readonly code = "AGENT_BUDGET_EXCEEDED";
  readonly reason: string;

  constructor(reason: string) {
    super("Agent execution budget exceeded.");
    this.name = "AgentTaskBudgetExceededError";
    this.reason = reason;
  }
}

function validInteger(value: number, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

export function resolveAgentTaskBudget(agent?: AgentTaskBudgetInput): AgentTaskBudget {
  const maxSteps = agent?.maxSteps ?? DEFAULT_AGENT_TASK_BUDGET.maxSteps;
  const maxToolCalls = agent?.maxToolCalls ?? DEFAULT_AGENT_TASK_BUDGET.maxToolCalls;
  if (!validInteger(maxSteps, 1, 16) || !validInteger(maxToolCalls, 0, 8)) {
    throw new Error("Agent execution limits are invalid.");
  }
  return Object.freeze({ ...DEFAULT_AGENT_TASK_BUDGET, maxSteps, maxToolCalls });
}

export function assertAgentTaskPlanWithinBudget(
  plan: { steps: readonly unknown[]; toolCalls: readonly unknown[] },
  budget: AgentTaskBudget,
): void {
  if (!Array.isArray(plan.steps) || !Array.isArray(plan.toolCalls)) {
    throw new AgentTaskBudgetExceededError("invalid plan shape");
  }
  if (plan.steps.length > budget.maxSteps) throw new AgentTaskBudgetExceededError("step count");
  if (plan.toolCalls.length > budget.maxToolCalls) throw new AgentTaskBudgetExceededError("tool call count");
}

export function getAgentTaskJsonByteLength(value: unknown): number {
  let serialized: string;
  try { serialized = JSON.stringify(value) ?? "null"; }
  catch { throw new AgentTaskBudgetExceededError("non-serializable tool result"); }
  return Buffer.byteLength(serialized, "utf8");
}

export function assertAgentTaskToolResultWithinBudget(
  resultBytes: number,
  totalBytes: number,
  budget: AgentTaskBudget,
): void {
  if (!Number.isSafeInteger(resultBytes) || resultBytes < 0 ||
      !Number.isSafeInteger(totalBytes) || totalBytes < 0) {
    throw new AgentTaskBudgetExceededError("invalid result size");
  }
  if (resultBytes > budget.maxToolResultBytes) throw new AgentTaskBudgetExceededError("single tool result size");
  if (totalBytes + resultBytes > budget.maxTotalToolResultBytes) {
    throw new AgentTaskBudgetExceededError("combined tool result size");
  }
}

export function assertAgentTaskTimeBudget(startedAtMs: number, nowMs: number, budget: AgentTaskBudget): void {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs) || nowMs < startedAtMs) {
    throw new AgentTaskBudgetExceededError("invalid execution clock");
  }
  if (nowMs - startedAtMs > budget.maxExecutionMs) throw new AgentTaskBudgetExceededError("execution time");
}
