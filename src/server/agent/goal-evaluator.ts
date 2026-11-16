import type { AgentPlan } from "@/shared/agent/contracts";
import type { SynthesisToolResult } from "./synthesis-context";

export type AgentGoalEvaluation = {
  verdict: "criteria_covered" | "partial" | "needs_review";
  criteria: Array<{ stepId: string; expectedOutcome: string; status: "covered" | "missing" | "unverifiable"; matchedTerms: string[]; missingTerms: string[] }>;
  coveredCriteria: number;
  missingCriteria: number;
  unverifiableCriteria: number;
  method: "deterministic_evidence_term_coverage";
  semanticGoalVerification: "not_performed";
  reasons: string[];
};

const STOP_WORDS = new Set(["about","after","also","and","any","are","because","before","been","being","between","but","can","could","does","each","for","from","has","have","into","its","may","might","must","not","one","our","out","per","should","some","such","than","that","the","their","then","there","these","they","this","those","through","tool","tools","was","were","will","with","would","your","step","task","expected","outcome","result","results","output","outputs","success","successful","complete","completed","observed","returned","provided"]);

function meaningfulTerms(value: string): string[] {
  return [...new Set((value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((term) => !STOP_WORDS.has(term)))].slice(0, 20);
}

/** Deterministic evidence coverage only; this is not semantic or real-world truth verification. */
export function evaluateAgentGoalCriteria(plan: AgentPlan, toolResults: SynthesisToolResult[], answer: string): AgentGoalEvaluation {
  const successfulResults = toolResults.filter((item) => {
    if (typeof item.result !== "object" || item.result === null || Array.isArray(item.result)) return true;
    const value = item.result as Record<string, unknown>;
    return value.ok !== false && !(typeof value.status === "string" && ["failed","cancelled","expired","error"].includes(value.status.toLowerCase()));
  });
  let observed = answer;
  try { observed += "\n" + JSON.stringify(successfulResults); } catch { /* Answer-only evidence remains available. */ }
  const observedTerms = new Set(meaningfulTerms(observed));
  const criteria = plan.steps.map((step) => {
    const expected = meaningfulTerms(step.expectedOutcome);
    if (!expected.length) return { stepId: step.id, expectedOutcome: step.expectedOutcome, status: "unverifiable" as const, matchedTerms: [], missingTerms: [] };
    const matchedTerms = expected.filter((term) => observedTerms.has(term));
    const missingTerms = expected.filter((term) => !observedTerms.has(term));
    return { stepId: step.id, expectedOutcome: step.expectedOutcome, status: missingTerms.length ? "missing" as const : "covered" as const, matchedTerms, missingTerms };
  });
  const coveredCriteria = criteria.filter((item) => item.status === "covered").length;
  const missingCriteria = criteria.filter((item) => item.status === "missing").length;
  const unverifiableCriteria = criteria.filter((item) => item.status === "unverifiable").length;
  const reasons: string[] = [];
  if (!criteria.length) reasons.push("The plan contains no expected outcomes to evaluate.");
  if (missingCriteria) reasons.push(missingCriteria + " planned outcome(s) have terms not found in the observed answer or successful tool output.");
  if (unverifiableCriteria) reasons.push(unverifiableCriteria + " planned outcome(s) contain no meaningful terms for deterministic comparison.");
  return {
    verdict: !criteria.length || unverifiableCriteria ? "needs_review" : missingCriteria ? "partial" : "criteria_covered",
    criteria, coveredCriteria, missingCriteria, unverifiableCriteria,
    method: "deterministic_evidence_term_coverage",
    semanticGoalVerification: "not_performed",
    reasons,
  };
}
