import { timingSafeEqual } from "node:crypto";

export const PERSONAL_OWNER_ID = "00000000-0000-4000-8000-000000000001";

function secret(): string {
  const value = process.env.FS_OWNER_TOKEN;
  if (!value || value.length < 32) {
    throw new Error("Owner authentication is not configured.");
  }
  return value;
}

export function isSameOriginRequest(request: Request): boolean {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return true;

  try {
    const origin = new URL(originHeader);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = (forwardedHost || request.headers.get("host") || new URL(request.url).host).toLowerCase();
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = (forwardedProto || new URL(request.url).protocol.replace(":", "")).toLowerCase();
    return origin.host.toLowerCase() === host && origin.protocol === protocol + ":";
  } catch {
    return false;
  }
}

export function verifyOwnerMasterToken(value: unknown): boolean {
  if (typeof value !== "string" || value.length < 32) return false;
  const expected = Buffer.from(secret(), "utf8");
  const supplied = Buffer.from(value, "utf8");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

/**
 * Personal single-owner access for the private MCP backend.
 * The master token is checked on every request; no short-lived session is issued.
 */
export function verifyOwnerRequest(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const supplied =
    request.headers.get("x-fs-owner-token") ??
    (authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "");

  if (!verifyOwnerMasterToken(supplied) || !isSameOriginRequest(request)) return null;
  return PERSONAL_OWNER_ID;
}
