import {
  extractSourceReferenceCandidates,
  type SynthesisToolResult,
} from "./synthesis-context";

const URL_PATTERN = /https?:\/\/[^\s"'<>\\]+/g;

function normalizeUrl(value: string): string {
  return value.replace(/[),.;\]}]+$/, "");
}

/**
 * Adds a deterministic evidence-status label and removes links that were not
 * present in the raw tool outputs. This does not prove that a source is true;
 * it only prevents the model from introducing a new URL as if it were evidence.
 */
export function guardSynthesisAnswer(
  answer: string,
  toolResults: SynthesisToolResult[],
): string {
  const allowedUrls = new Set(toolResults.flatMap((item) =>
    extractSourceReferenceCandidates(item.result),
  ));
  let removedUrls = 0;
  const safeAnswer = answer.replace(URL_PATTERN, (candidate) => {
    if (allowedUrls.has(normalizeUrl(candidate))) return candidate;
    removedUrls += 1;
    return "[unverified URL omitted]";
  }).trim();

  const status = allowedUrls.size > 0
    ? "SOURCE REFERENCES PRESENT — NOT INDEPENDENTLY VERIFIED"
    : "UNVERIFIED — NO SOURCE URL WAS RETURNED BY TOOLS";
  const limitations = [
    "This is AI-generated synthesis. Tool outputs are observations, not proof of real-world accuracy.",
    "Verify important claims against the original sources; uncertainty, conflicts, stale data, and missing evidence must not be treated as settled facts.",
    ...(removedUrls > 0 ? [String(removedUrls) + " URL(s) not present in tool evidence were removed."] : []),
  ];

  return [
    "Evidence status: " + status,
    ...limitations,
    "",
    safeAnswer || "I cannot provide a verified conclusion from the available evidence.",
  ].join("\n");
}
