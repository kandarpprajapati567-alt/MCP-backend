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

function isStrictIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/.test(value)) {
    return false;
  }
  const dateOnly = new Date(value.slice(0, 10) + "T00:00:00.000Z");
  return Number.isFinite(dateOnly.getTime()) &&
    dateOnly.toISOString().slice(0, 10) === value.slice(0, 10) &&
    Number.isFinite(Date.parse(value));
}

function jsonByteLength(value: unknown): number {
  try {
    const encoded = JSON.stringify(value);
    return typeof encoded === "string" ? new TextEncoder().encode(encoded).byteLength : Infinity;
  } catch {
    return Infinity;
  }
}

function validatePortableSchema(schema: unknown, depth = 0): boolean {
  if (!isRecord(schema) || depth > 8 || typeof schema.type !== "string") return false;
  const enumValues = schema.enum;
  if (enumValues !== undefined && (!Array.isArray(enumValues) || enumValues.length < 1 ||
      enumValues.length > 100 || jsonByteLength(enumValues) > 4_000)) return false;

  switch (schema.type) {
    case "string": {
      if (!hasOnlyKeys(schema, ["type"], ["description", "minLength", "maxLength", "enum"])) return false;
      if (schema.description !== undefined && !isBoundedText(schema.description, 200)) return false;
      if (schema.minLength !== undefined && (!Number.isInteger(schema.minLength) || (schema.minLength as number) < 0 || (schema.minLength as number) > 12_000)) return false;
      if (schema.maxLength !== undefined && (!Number.isInteger(schema.maxLength) || (schema.maxLength as number) < 0 || (schema.maxLength as number) > 12_000)) return false;
      if (typeof schema.minLength === "number" && typeof schema.maxLength === "number" && schema.minLength > schema.maxLength) return false;
      if (enumValues !== undefined && enumValues.some((item) => typeof item !== "string" ||
          (typeof schema.maxLength === "number" && item.length > schema.maxLength) ||
          (typeof schema.minLength === "number" && item.length < schema.minLength))) return false;
      return true;
    }
    case "number":
    case "integer": {
      if (!hasOnlyKeys(schema, ["type"], ["description", "minimum", "maximum", "enum"])) return false;
      if (schema.description !== undefined && !isBoundedText(schema.description, 200)) return false;
      if (schema.minimum !== undefined && (typeof schema.minimum !== "number" || !Number.isFinite(schema.minimum))) return false;
      if (schema.maximum !== undefined && (typeof schema.maximum !== "number" || !Number.isFinite(schema.maximum))) return false;
      if (typeof schema.minimum === "number" && typeof schema.maximum === "number" && schema.minimum > schema.maximum) return false;
      if (enumValues !== undefined && enumValues.some((item) => typeof item !== "number" ||
          !Number.isFinite(item) || (schema.type === "integer" && !Number.isInteger(item)) ||
          (typeof schema.minimum === "number" && item < schema.minimum) ||
          (typeof schema.maximum === "number" && item > schema.maximum))) return false;
      return true;
    }
    case "boolean":
      return hasOnlyKeys(schema, ["type"], ["description", "enum"]) &&
        (schema.description === undefined || isBoundedText(schema.description, 200)) &&
        (enumValues === undefined || enumValues.every((item) => typeof item === "boolean"));
    case "object": {
      if (!hasOnlyKeys(schema, ["type", "properties", "additionalProperties"], [
        "description", "required", "minProperties", "maxProperties",
      ])) return false;
      if (schema.description !== undefined && !isBoundedText(schema.description, 200)) return false;
      if (schema.additionalProperties !== false || !isRecord(schema.properties)) return false;
      const properties = schema.properties;
      const keys = Object.keys(properties);
      if (keys.length > 64 || keys.some((key) => !key.trim() || key.length > 120)) return false;
      if (!keys.every((key) => validatePortableSchema(properties[key], depth + 1))) return false;
      if (schema.required !== undefined &&
          (!Array.isArray(schema.required) || schema.required.length > keys.length ||
           new Set(schema.required).size !== schema.required.length ||
           schema.required.some((item) => typeof item !== "string" || !Object.hasOwn(properties, item)))) return false;
      if (schema.minProperties !== undefined && (!Number.isInteger(schema.minProperties) || (schema.minProperties as number) < 0 || (schema.minProperties as number) > 64)) return false;
      if (schema.maxProperties !== undefined && (!Number.isInteger(schema.maxProperties) || (schema.maxProperties as number) < 0 || (schema.maxProperties as number) > 64)) return false;
      if (typeof schema.minProperties === "number" && typeof schema.maxProperties === "number" && schema.minProperties > schema.maxProperties) return false;
      return true;
    }
    case "array": {
      if (!hasOnlyKeys(schema, ["type", "items"], ["description", "minItems", "maxItems"])) return false;
      if (schema.description !== undefined && !isBoundedText(schema.description, 200)) return false;
      if (!validatePortableSchema(schema.items, depth + 1)) return false;
      if (schema.minItems !== undefined && (!Number.isInteger(schema.minItems) || (schema.minItems as number) < 0 || (schema.minItems as number) > 100)) return false;
      if (schema.maxItems !== undefined && (!Number.isInteger(schema.maxItems) || (schema.maxItems as number) < 0 || (schema.maxItems as number) > 100)) return false;
      if (typeof schema.minItems === "number" && typeof schema.maxItems === "number" && schema.minItems > schema.maxItems) return false;
      return true;
    }
    default:
      return false;
  }
}

/**
 * Validates a bounded portable JSON Schema subset for a capability manifest.
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
  if (!isRecord(schema) || schema.type !== "object" || schema.additionalProperties !== false ||
      !isRecord(schema.properties) || jsonByteLength(schema) > MAX_SCHEMA_BYTES ||
      !validatePortableSchema(schema)) return false;
  if (!Array.isArray(value.requiredPermissions) || value.requiredPermissions.length > 32 ||
      value.requiredPermissions.some((permission) => !isBoundedText(permission, 100)) ||
      new Set(value.requiredPermissions).size !== value.requiredPermissions.length) return false;
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
      !isBoundedText(value.capabilityId, 120) || !isBoundedText(value.idempotencyKey, 128) ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(String(value.idempotencyKey))) return false;
  if (value.taskId !== null && !isBoundedText(value.taskId, 128)) return false;
  if (value.targetRuntime !== "web" && value.targetRuntime !== "android") return false;
  if (value.targetDeviceId !== null && !isBoundedText(value.targetDeviceId, 128)) return false;
  if (value.targetRuntime === "web" && value.targetDeviceId !== null) return false;
  if (value.targetRuntime === "android" && value.targetDeviceId === null) return false;
  if (!isRecord(value.arguments) || jsonByteLength(value.arguments) > MAX_ARGUMENT_BYTES) return false;
  if (!isStrictIsoTimestamp(value.createdAt) || !isStrictIsoTimestamp(value.expiresAt)) return false;
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
  if (!isStrictIsoTimestamp(value.completedAt)) return false;
  if (value.errorCode !== undefined && !isBoundedText(value.errorCode, 100)) return false;
  if (value.result !== undefined && jsonByteLength(value.result) > MAX_ARGUMENT_BYTES) return false;
  if (!Array.isArray(value.evidence) || value.evidence.length > MAX_EVIDENCE_ITEMS ||
      value.evidence.some((item) => !isRecord(item) ||
        !isBoundedText(item.kind, 80) || !isBoundedText(item.source, 200) ||
        !isBoundedText(item.summary, 500))) return false;
  if (value.status === "completed" && value.errorCode !== undefined) return false;
  if (value.status !== "completed" && (value.result !== undefined || value.errorCode === undefined)) return false;
  return true;
}
