import { isIP } from "node:net";

type JsonRecord = Record<string, unknown>;
type RemoteInputSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};
export type RemoteMcpTool = {
  id: string;
  name: string;
  description: string;
  inputSchema: RemoteInputSchema;
  annotations: { readOnlyHint: true; destructiveHint: false; idempotentHint: boolean; openWorldHint: true };
};


function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPublicIpv4Address(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}


export function normalizeRemoteMcpEndpoint(value: unknown): URL {
  if (typeof value !== "string" || value.length > 2048) throw new Error("A valid HTTPS MCP endpoint is required.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("A valid HTTPS MCP endpoint is required."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
      (url.port && url.port !== "443") || url.search || !url.hostname || url.hostname.startsWith("[") || isIP(url.hostname) !== 0 ||
      url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) {
    throw new Error("Remote MCP endpoints must use a public HTTPS hostname on port 443 without embedded credentials.");
  }
  return url;
}


export function sanitizeRemoteTool(serverId: string, raw: unknown): RemoteMcpTool | null {
  if (!isRecord(raw) || typeof raw.name !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/u.test(raw.name) ||
      !isRecord(raw.annotations) || raw.annotations.readOnlyHint !== true || raw.annotations.destructiveHint === true ||
      !isRecord(raw.inputSchema) || raw.inputSchema.type !== "object" || !isRecord(raw.inputSchema.properties)) return null;

  const rootKeys = new Set(["type", "properties", "required", "additionalProperties", "title", "description", "$schema"]);
  if (Object.keys(raw.inputSchema).some((key) => !rootKeys.has(key)) ||
      (raw.inputSchema.additionalProperties !== undefined && raw.inputSchema.additionalProperties !== false)) return null;

  const entries = Object.entries(raw.inputSchema.properties);
  if (entries.length > 24) return null;
  const properties: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, schema] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(key) || !isRecord(schema) ||
        !["string", "number", "integer", "boolean"].includes(String(schema.type))) return null;
    const type = schema.type;
    const allowedKeys = type === "string"
      ? new Set(["type", "minLength", "maxLength"])
      : type === "number" || type === "integer"
        ? new Set(["type", "minimum", "maximum"])
        : new Set(["type"]);
    if (Object.keys(schema).some((propertyKey) => !allowedKeys.has(propertyKey))) return null;

    if (type === "string") {
      if ((schema.maxLength !== undefined && (typeof schema.maxLength !== "number" || !Number.isInteger(schema.maxLength) || schema.maxLength < 1)) ||
          (schema.minLength !== undefined && (typeof schema.minLength !== "number" || !Number.isInteger(schema.minLength) || schema.minLength < 0))) return null;
      const maxLength = typeof schema.maxLength === "number" ? Math.min(4000, schema.maxLength) : 2000;
      const minLength = typeof schema.minLength === "number" ? schema.minLength : 0;
      if (minLength > maxLength) return null;
      properties[key] = { type, maxLength, minLength };
    } else if (type === "number" || type === "integer") {
      if ((schema.minimum !== undefined && (typeof schema.minimum !== "number" || !Number.isFinite(schema.minimum))) ||
          (schema.maximum !== undefined && (typeof schema.maximum !== "number" || !Number.isFinite(schema.maximum))) ||
          (typeof schema.minimum === "number" && typeof schema.maximum === "number" && schema.minimum > schema.maximum)) return null;
      properties[key] = {
        type,
        ...(typeof schema.minimum === "number" ? { minimum: schema.minimum } : {}),
        ...(typeof schema.maximum === "number" ? { maximum: schema.maximum } : {}),
      };
    } else {
      properties[key] = { type: "boolean" };
    }
  }

  const rawRequired = raw.inputSchema.required === undefined ? [] : raw.inputSchema.required;
  if (!Array.isArray(rawRequired) || rawRequired.length > 24 ||
      rawRequired.some((item) => typeof item !== "string" || !Object.hasOwn(properties, item)) ||
      new Set(rawRequired).size !== rawRequired.length) return null;
  const required = rawRequired as string[];
  const description = typeof raw.description === "string" ? raw.description.slice(0, 500) : "Read-only tool from a connected remote MCP server.";
  return {
    id: "remote_mcp." + serverId + "." + raw.name,
    name: raw.name,
    description,
    inputSchema: { type: "object", properties, required, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: raw.annotations.idempotentHint === true, openWorldHint: true },
  };
}

export function validateRemoteToolArguments(schema: RemoteInputSchema, args: unknown): args is JsonRecord {
  if (!isRecord(args) || Object.keys(args).some((key) => !Object.hasOwn(schema.properties, key))) return false;
  if (schema.required.some((key) => !Object.hasOwn(args, key))) return false;
  for (const [key, value] of Object.entries(args)) {
    const property = schema.properties[key];
    if (!isRecord(property)) return false;
    if (property.type === "string") {
      if (typeof value !== "string" || (typeof property.maxLength === "number" && value.length > property.maxLength) ||
          (typeof property.minLength === "number" && value.length < property.minLength)) return false;
    } else if (property.type === "number" || property.type === "integer") {
      if (typeof value !== "number" || !Number.isFinite(value) ||
          (property.type === "integer" && !Number.isInteger(value)) ||
          (typeof property.minimum === "number" && value < property.minimum) ||
          (typeof property.maximum === "number" && value > property.maximum)) return false;
    } else if (property.type === "boolean" && typeof value !== "boolean") return false;
  }
  try {
    return Buffer.byteLength(JSON.stringify(args), "utf8") <= 16_000;
  } catch {
    return false;
  }
}
