import { createHmac, timingSafeEqual } from "node:crypto";

export const PERSONAL_OWNER_ID = "00000000-0000-4000-8000-000000000001";
export const OWNER_SESSION_COOKIE = "fs_owner_session";
export const OWNER_SESSION_TTL_SECONDS = 8 * 60 * 60;

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

function ownerSessionSignature(expiresAt: number): Buffer {
  return createHmac("sha256", secret())
    .update(PERSONAL_OWNER_ID + ":" + String(expiresAt))
    .digest();
}

/** Exchange the master credential for a signed, bounded browser session. */
export function createOwnerSessionToken(value: unknown, nowMs = Date.now()): string | null {
  if (!verifyOwnerMasterToken(value)) return null;
  const expiresAt = Math.floor(nowMs / 1000) + OWNER_SESSION_TTL_SECONDS;
  return String(expiresAt) + "." + ownerSessionSignature(expiresAt).toString("base64url");
}

export function verifyOwnerSessionToken(value: unknown, nowMs = Date.now()): boolean {
  if (typeof value !== "string") return false;
  const parts = value.split(".");
  if (parts.length !== 2 || !/^\d{10,}$/.test(parts[0])) return false;

  const expiresAt = Number(parts[0]);
  const now = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now ||
      expiresAt > now + OWNER_SESSION_TTL_SECONDS + 30) return false;

  let supplied: Buffer;
  try {
    supplied = Buffer.from(parts[1], "base64url");
  } catch {
    return false;
  }
  const expected = ownerSessionSignature(expiresAt);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return null;
}

/**
 * Personal single-owner access for the private backend.
 * API clients may still use the master token; browser clients can exchange it
 * once for an eight-hour HttpOnly, Secure-on-HTTPS, SameSite=Strict session.
 */
export function verifyOwnerRequest(request: Request): string | null {
  if (!isSameOriginRequest(request)) return null;

  const authorization = request.headers.get("authorization");
  const supplied =
    request.headers.get("x-fs-owner-token") ??
    (authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "");

  if (verifyOwnerMasterToken(supplied)) return PERSONAL_OWNER_ID;

  const session = cookieValue(request.headers.get("cookie"), OWNER_SESSION_COOKIE);
  return verifyOwnerSessionToken(session) ? PERSONAL_OWNER_ID : null;
}
