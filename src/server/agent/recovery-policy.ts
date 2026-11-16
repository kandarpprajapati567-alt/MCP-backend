import type { AgentToolCall } from "@/shared/agent/contracts";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

/** Stable identity for a tool operation, independent of JSON object key order. */
export function fingerprintAgentToolCall(call: Pick<AgentToolCall, "toolId" | "arguments">): string {
  return call.toolId + ":" + JSON.stringify(stableValue(call.arguments));
}

/**
 * Recovery may add only new, registered read-only/idempotent operations.
 * Previously attempted operations are excluded even when they failed, so a
 * recovery plan cannot accidentally replay an external side effect.
 */
export function selectSafeRecoveryToolCalls(
  candidates: readonly AgentToolCall[],
  attemptedFingerprints: ReadonlySet<string>,
  safeToolIds: ReadonlySet<string>,
  remainingBudget: number,
  alreadyUsedCallSlots: number,
): AgentToolCall[] {
  const capacity = Math.max(0, Math.min(8 - alreadyUsedCallSlots, Math.floor(remainingBudget)));
  if (capacity === 0) return [];

  const selected: AgentToolCall[] = [];
  const selectedFingerprints = new Set<string>();
  for (const candidate of candidates) {
    if (selected.length >= capacity) break;
    if (!safeToolIds.has(candidate.toolId)) continue;
    const fingerprint = fingerprintAgentToolCall(candidate);
    if (attemptedFingerprints.has(fingerprint) || selectedFingerprints.has(fingerprint)) continue;
    selectedFingerprints.add(fingerprint);
    selected.push({
      id: "call-" + (alreadyUsedCallSlots + selected.length + 1),
      toolId: candidate.toolId,
      arguments: candidate.arguments,
    });
  }
  return selected;
}
