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
  if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) return false;
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
      (url.port && url.port !== "443") || url.search || !url.hostname || isIP(url.hostname) !== 0 ||
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

  const entries = Object.entries(raw.inputSchema.properties);
  if (entries.length > 24) return null;
  const properties: Record<string, unknown> = {};
  for (const [key, schema] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(key) || !isRecord(schema) ||
        !["string", "number", "integer", "boolean"].includes(String(schema.type))) return null;
    const type = schema.type;
    if (type === "string") {
      const maxLength = typeof schema.maxLength === "number" ? Math.min(4000, Math.max(1, schema.maxLength)) : 2000;
      const minLength = typeof schema.minLength === "number" ? Math.max(0, Math.min(maxLength, schema.minLength)) : 0;
      properties[key] = { type, maxLength, minLength };
    } else if (type === "number" || type === "integer") {
      properties[key] = {
        type,
        ...(typeof schema.minimum === "number" && Number.isFinite(schema.minimum) ? { minimum: schema.minimum } : {}),
        ...(typeof schema.maximum === "number" && Number.isFinite(schema.maximum) ? { maximum: schema.maximum } : {}),
      };
    } else {
      properties[key] = { type: "boolean" };
    }
  }
  const required = Array.isArray(raw.inputSchema.required)
    ? raw.inputSchema.required.filter((item): item is string => typeof item === "string" && item in properties)
    : [];
  if (required.length > 24) return null;
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
  if (!isRecord(args) || Object.keys(args).some((key) => !(key in schema.properties))) return false;
  if (schema.required.some((key) => !(key in args))) return false;
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
  return Buffer.byteLength(JSON.stringify(args), "utf8") <= 16_000;
}


