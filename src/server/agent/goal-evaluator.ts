import type { AgentPlan } from "@/shared/agent/contracts";
import type { SynthesisToolResult } from "./synthesis-context";

export type AgentGoalEvaluation = {
  verdict: "criteria_covered" | "partial" | "needs_review";
  criteria: Array<{ stepId: string; expectedOutcome: string; status: "covered" | "missing" | "contradictory" | "unverifiable"; matchedTerms: string[]; missingTerms: string[]; contradictions: string[] }>;
  coveredCriteria: number;
  missingCriteria: number;
  contradictoryCriteria: number;
  unverifiableCriteria: number;
  method: "deterministic_evidence_term_coverage";
  semanticGoalVerification: "not_performed";
  reasons: string[];
};

const STOP_WORDS = new Set(["about","after","also","and","any","are","because","before","been","being","between","but","can","could","does","each","for","from","has","have","into","its","may","might","must","not","one","our","out","per","should","some","such","than","that","the","their","then","there","these","they","this","those","through","tool","tools","was","were","will","with","would","your","step","task","expected","outcome","result","results","output","outputs","success","successful","complete","completed","observed","returned","provided"]);

function meaningfulTerms(value: string): string[] {
  return [...new Set((value.toLowerCase().match(/[a-z]{3,}|[0-9]+/g) ?? []).filter((term) => !STOP_WORDS.has(term)))].slice(0, 20);
}

function isSuccessfulResult(result: unknown): boolean {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return true;
  const value = result as Record<string, unknown>;
  return value.ok !== false && !(typeof value.status === "string" && ["failed","cancelled","expired","error"].includes(value.status.toLowerCase()));
}

function collectNumericFields(value: unknown, path: string[] = []): Array<{ key: string; value: number }> {
  if (Array.isArray(value)) return value.flatMap((item) => collectNumericFields(item, path));
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    if (typeof child === "number" && Number.isFinite(child)) return [{ key: [...path, key].join(" "), value: child }];
    return collectNumericFields(child, [...path, key]);
  });
}

/** Deterministic evidence coverage and structured numeric contradiction checks; not semantic or real-world truth verification. */
export function evaluateAgentGoalCriteria(plan: AgentPlan, toolResults: SynthesisToolResult[], answer: string): AgentGoalEvaluation {
  const successfulResults = toolResults.filter((item) => isSuccessfulResult(item.result));
  let observed = answer;
  try { observed += "\n" + JSON.stringify(successfulResults.map((item) => item.result)); } catch { /* Answer-only evidence remains available. */ }
  const observedTerms = new Set(meaningfulTerms(observed));
  const numericFields = successfulResults.flatMap((item) => collectNumericFields(item.result));
  const criteria = plan.steps.map((step) => {
    const expected = meaningfulTerms(step.expectedOutcome);
    if (!expected.length) return { stepId: step.id, expectedOutcome: step.expectedOutcome, status: "unverifiable" as const, matchedTerms: [], missingTerms: [], contradictions: [] };
    const matchedTerms = expected.filter((term) => observedTerms.has(term));
    const missingTerms = expected.filter((term) => !observedTerms.has(term));
    const expectedNumbers = expected.filter((term) => /^\d+(?:\.\d+)?$/.test(term)).map(Number);
    const expectedWords = new Set(expected.filter((term) => !/^\d+(?:\.\d+)?$/.test(term)));
    const contradictions = numericFields
      .filter((field) => {
        const keyTerms = meaningfulTerms(field.key);
        return keyTerms.some((term) => expectedWords.has(term)) &&
          expectedNumbers.length > 0 && !expectedNumbers.some((number) => number === field.value);
      })
      .map((field) => "Observed " + field.key + "=" + field.value + " conflicts with expected value(s) " + expectedNumbers.join(", "));
    const status = contradictions.length ? "contradictory" as const : missingTerms.length ? "missing" as const : "covered" as const;
    return { stepId: step.id, expectedOutcome: step.expectedOutcome, status, matchedTerms, missingTerms, contradictions };
  });
  const coveredCriteria = criteria.filter((item) => item.status === "covered").length;
  const missingCriteria = criteria.filter((item) => item.status === "missing").length;
  const contradictoryCriteria = criteria.filter((item) => item.status === "contradictory").length;
  const unverifiableCriteria = criteria.filter((item) => item.status === "unverifiable").length;
  const reasons: string[] = [];
  if (!criteria.length) reasons.push("The plan contains no expected outcomes to evaluate.");
  if (missingCriteria) reasons.push(missingCriteria + " planned outcome(s) have terms not found in the observed answer or successful tool output.");
  if (contradictoryCriteria) reasons.push(contradictoryCriteria + " planned outcome(s) conflict with structured values returned by successful tools.");
  if (unverifiableCriteria) reasons.push(unverifiableCriteria + " planned outcome(s) contain no meaningful terms for deterministic comparison.");
  return {
    verdict: !criteria.length || unverifiableCriteria || contradictoryCriteria ? "needs_review" : missingCriteria ? "partial" : "criteria_covered",
    criteria, coveredCriteria, missingCriteria, contradictoryCriteria, unverifiableCriteria,
    method: "deterministic_evidence_term_coverage",
    semanticGoalVerification: "not_performed",
    reasons,
  };
}
