export interface AgentPlanStep {
  id: string;
  objective: string;
  expectedOutcome: string;
}

export interface AgentPlan {
  version: 1;
  goal: string;
  steps: AgentPlanStep[];
}

export type PlanParseResult =
  | { ok: true; value: AgentPlan }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

/** Strictly validates untrusted model output before any future executor can consume it. */
export function parseAgentPlan(value: unknown): PlanParseResult {
  if (!isRecord(value) || !hasExactKeys(value, ["version", "goal", "steps"])) {
    return { ok: false, error: "Plan must contain only version, goal, and steps." };
  }
  if (value.version !== 1) return { ok: false, error: "Unsupported plan version." };
  if (typeof value.goal !== "string" || value.goal.trim().length < 1 || value.goal.length > 500) {
    return { ok: false, error: "Plan goal must be between 1 and 500 characters." };
  }
  if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 8) {
    return { ok: false, error: "Plan must contain between 1 and 8 steps." };
  }

  const seen = new Set<string>();
  const steps: AgentPlanStep[] = [];
  for (const rawStep of value.steps) {
    if (!isRecord(rawStep) || !hasExactKeys(rawStep, ["id", "objective", "expectedOutcome"])) {
      return { ok: false, error: "Each step must contain only id, objective, and expectedOutcome." };
    }
    const { id, objective, expectedOutcome } = rawStep;
    if (typeof id !== "string" || !/^step-[1-8]$/.test(id) || seen.has(id)) {
      return { ok: false, error: "Step IDs must be unique values from step-1 through step-8." };
    }
    if (typeof objective !== "string" || objective.trim().length < 1 || objective.length > 500) {
      return { ok: false, error: "Each objective must be between 1 and 500 characters." };
    }
    if (typeof expectedOutcome !== "string" || expectedOutcome.trim().length < 1 || expectedOutcome.length > 300) {
      return { ok: false, error: "Each expected outcome must be between 1 and 300 characters." };
    }
    seen.add(id);
    steps.push({ id, objective, expectedOutcome });
  }

  return { ok: true, value: { version: 1, goal: value.goal, steps } };
}
