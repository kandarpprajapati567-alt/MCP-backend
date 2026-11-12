import type {
  AgentCapabilityManifestEntry,
  AgentInvocationEnvelope,
  AgentInvocationResult,
} from "./contracts";

const MAX_SCHEMA_BYTES = 16_000;
const MAX_ARGUMENT_BYTES = 16_000;
const MAX_EVIDENCE_ITEMS = 20;
const MAX_TEXT_LENGTH = 2_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedText(value: unknown, max = MAX_TEXT_LENGTH): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function hasOnlyKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key));
}

function jsonByteLength(value: unknown): number {
  try {
    const encoded = JSON.stringify(value);
    return typeof encoded === "string" ? new TextEncoder().encode(encoded).byteLength : Infinity;
  } catch {
    return Infinity;
  }
}

/**
 * Validates the portable, normalized subset of a capability manifest.
 * Runtime-specific permission checks must still happen in the owning runtime.
 */
export function isValidCapabilityManifestEntry(
  value: unknown,
): value is AgentCapabilityManifestEntry {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "id", "runtime", "manifestVersion", "description", "inputSchema",
    "requiredPermissions", "sideEffect", "idempotent", "requiresUserApproval",
  ])) return false;
  if (!isBoundedText(value.id, 120) || !/^[a-z0-9][a-z0-9._-]*$/.test(value.id)) return false;
  if (value.runtime !== "web" && value.runtime !== "android") return false;
  if (!Number.isInteger(value.manifestVersion) || (value.manifestVersion as number) < 1) return false;
  if (!isBoundedText(value.description, 500)) return false;
  const schema = value.inputSchema;
  if (!isRecord(schema) || schema.type !== "object" ||
      !isRecord(schema.properties) || schema.additionalProperties !== false) return false;
  const properties = schema.properties;
  if (jsonByteLength(schema) > MAX_SCHEMA_BYTES || Object.keys(properties).length > 64) return false;
  for (const property of Object.values(properties)) {
    if (!isRecord(property) || !["string", "number", "integer", "boolean"].includes(String(property.type))) return false;
    if (property.type === "string") {
      if (property.maxLength !== undefined && (!Number.isInteger(property.maxLength) || (property.maxLength as number) < 0 || (property.maxLength as number) > 12_000)) return false;
      if (property.minLength !== undefined && (!Number.isInteger(property.minLength) || (property.minLength as number) < 0 || (property.minLength as number) > 12_000)) return false;
      if (typeof property.maxLength === "number" && typeof property.minLength === "number" && property.minLength > property.maxLength) return false;
    } else if (property.minimum !== undefined || property.maximum !== undefined) {
      if (property.minimum !== undefined && (typeof property.minimum !== "number" || !Number.isFinite(property.minimum))) return false;
      if (property.maximum !== undefined && (typeof property.maximum !== "number" || !Number.isFinite(property.maximum))) return false;
      if (typeof property.minimum === "number" && typeof property.maximum === "number" && property.minimum > property.maximum) return false;
    }
  }
  if (schema.required !== undefined &&
      (!Array.isArray(schema.required) || schema.required.length > Object.keys(properties).length ||
       new Set(schema.required).size !== schema.required.length ||
       schema.required.some((item) => typeof item !== "string" || !Object.hasOwn(properties, item)))) return false;
  if (!Array.isArray(value.requiredPermissions) || value.requiredPermissions.length > 32 ||
      value.requiredPermissions.some((permission) => !isBoundedText(permission, 100))) return false;
  return typeof value.sideEffect === "boolean" &&
    typeof value.idempotent === "boolean" &&
    typeof value.requiresUserApproval === "boolean";
}

export function isValidInvocationEnvelope(value: unknown, now = Date.now()): value is AgentInvocationEnvelope {
  if (!isRecord(value) || value.contractVersion !== 1 || !hasOnlyKeys(value, [
    "contractVersion", "invocationId", "taskId", "toolCallId", "targetRuntime",
    "targetDeviceId", "capabilityId", "arguments", "createdAt", "expiresAt", "idempotencyKey",
  ])) return false;
  if (!isBoundedText(value.invocationId, 128) || !isBoundedText(value.toolCallId, 128) ||
      !isBoundedText(value.capabilityId, 120) || !isBoundedText(value.idempotencyKey, 128)) return false;
  if (value.taskId !== null && !isBoundedText(value.taskId, 128)) return false;
  if (value.targetRuntime !== "web" && value.targetRuntime !== "android") return false;
  if (value.targetDeviceId !== null && !isBoundedText(value.targetDeviceId, 128)) return false;
  if (value.targetRuntime === "web" && value.targetDeviceId !== null) return false;
  if (value.targetRuntime === "android" && value.targetDeviceId === null) return false;
  if (!isRecord(value.arguments) || jsonByteLength(value.arguments) > MAX_ARGUMENT_BYTES) return false;
  if (typeof value.createdAt !== "string" || typeof value.expiresAt !== "string") return false;
  const createdAt = Date.parse(value.createdAt);
  const expiresAt = Date.parse(value.expiresAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= createdAt) return false;
  if (expiresAt - createdAt > 24 * 60 * 60 * 1000 || expiresAt <= now) return false;
  return true;
}

export function isValidInvocationResult(value: unknown): value is AgentInvocationResult {
  if (!isRecord(value) || value.contractVersion !== 1 || !hasOnlyKeys(value, [
    "contractVersion", "invocationId", "taskId", "toolCallId", "runtime",
    "status", "completedAt", "evidence",
  ], ["result", "errorCode"])) return false;
  if (!isBoundedText(value.invocationId, 128) || !isBoundedText(value.toolCallId, 128)) return false;
  if (value.taskId !== null && !isBoundedText(value.taskId, 128)) return false;
  if (value.runtime !== "web" && value.runtime !== "android") return false;
  if (!["completed", "failed", "denied", "expired", "cancelled"].includes(String(value.status))) return false;
  if (typeof value.completedAt !== "string" || !Number.isFinite(Date.parse(value.completedAt))) return false;
  if (value.errorCode !== undefined && !isBoundedText(value.errorCode, 100)) return false;
  if (value.result !== undefined && jsonByteLength(value.result) > MAX_ARGUMENT_BYTES) return false;
  if (!Array.isArray(value.evidence) || value.evidence.length > MAX_EVIDENCE_ITEMS ||
      value.evidence.some((item) => !isRecord(item) ||
        !isBoundedText(item.kind, 80) || !isBoundedText(item.source, 200) ||
        !isBoundedText(item.summary, 500))) return false;
  if (value.status !== "completed" && value.result !== undefined) return false;
  return true;
}
