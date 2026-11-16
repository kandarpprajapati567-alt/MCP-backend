import type { SynthesisToolResult } from "./synthesis-context";

const URL_PATTERN = /https?:\/\/[^\s"'<>\\]+/g;
const FAILED_STATUSES = new Set(["failed", "cancelled", "expired", "error"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeUrl(value: string): string {
  return value.replace(/[),.;\]}]+$/, "");
}

function urlsIn(value: unknown): string[] {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return [];
  }
  return [...new Set((serialized.match(URL_PATTERN) ?? []).map(normalizeUrl))].slice(0, 100);
}

function isFailed(result: unknown): boolean {
  if (!isRecord(result)) return false;
  if (result.ok === false) return true;
  return typeof result.status === "string" && FAILED_STATUSES.has(result.status.toLowerCase());
}

export type SynthesisIntegrityReport = {
  status: "structurally_consistent" | "warning";
  toolOperations: number;
  failedOperations: number;
  unsupportedAnswerUrls: number;
  unsupportedEvidenceIds: number;
  uncitedEvidence: boolean;
  independentTruthVerification: "not_performed";
  warnings: string[];
};

/**
 * Deterministic integrity checks only. This verifies execution/citation consistency;
 * it does not establish that source content or real-world claims are true.
 */
export function verifySynthesisIntegrity(
  answer: string,
  toolResults: SynthesisToolResult[],
): SynthesisIntegrityReport {
  const successfulResults = toolResults.filter((item) => !isFailed(item.result));
  const allowedUrls = new Set(successfulResults.flatMap((item) => urlsIn(item.result)));
  const answerUrls = [...new Set((answer.match(URL_PATTERN) ?? []).map(normalizeUrl))];
  const unsupportedAnswerUrls = answerUrls.filter((url) => !allowedUrls.has(url)).length;
  const knownEvidenceIds = new Set(toolResults.map((item) => "ev-" + item.callId));
  const citedEvidenceIds = [...new Set((answer.match(/\[ev-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*\]/g) ?? []).map((value) => value.slice(1, -1)))];
  const unsupportedEvidenceIds = citedEvidenceIds.filter((id) => !knownEvidenceIds.has(id)).length;
  const uncitedEvidence = toolResults.length > 0 && citedEvidenceIds.length === 0;
  const failedOperations = toolResults.length - successfulResults.length;
  const warnings: string[] = [];

  if (toolResults.length === 0) warnings.push("No tool execution evidence was supplied.");
  if (failedOperations > 0) warnings.push(failedOperations + " tool operation(s) reported failure.");
  if (unsupportedAnswerUrls > 0) warnings.push(unsupportedAnswerUrls + " answer URL(s) were not present in successful tool output.");
  if (unsupportedEvidenceIds > 0) warnings.push(unsupportedEvidenceIds + " evidence reference(s) were not supplied to synthesis.");
  if (uncitedEvidence) warnings.push("No supplied evidence ID was cited in the synthesis answer.");

  return {
    status: warnings.length ? "warning" : "structurally_consistent",
    toolOperations: toolResults.length,
    failedOperations,
    unsupportedAnswerUrls,
    unsupportedEvidenceIds,
    uncitedEvidence,
    independentTruthVerification: "not_performed",
    warnings,
  };
}
