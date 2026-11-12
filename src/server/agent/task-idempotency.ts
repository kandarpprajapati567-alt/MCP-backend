import { createHash } from "node:crypto";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function isValidAgentTaskIdempotencyKey(value: string): boolean {
  return IDEMPOTENCY_KEY_PATTERN.test(value);
}

export function createAgentTaskRequestFingerprint(task: string, agentId: string | null): string {
  return createHash("sha256")
    .update(JSON.stringify({ task: task.trim(), agentId }))
    .digest("hex");
}

export function isSameAgentTaskRequest(
  storedFingerprint: unknown,
  expectedFingerprint: string,
): boolean {
  return typeof storedFingerprint === "string" &&
    /^[a-f0-9]{64}$/.test(storedFingerprint) &&
    storedFingerprint === expectedFingerprint;
}
