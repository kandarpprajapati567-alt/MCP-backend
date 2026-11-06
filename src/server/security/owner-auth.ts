import "server-only";
import { timingSafeEqual } from "node:crypto";
export const PERSONAL_OWNER_ID = "00000000-0000-4000-8000-000000000001";
export function verifyOwnerRequest(request: Request): string | null {
  const expected = process.env.FS_OWNER_TOKEN;
  if (!expected || expected.length < 32) return null;
  const supplied = request.headers.get("x-fs-owner-token") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(supplied, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const origin = request.headers.get("origin");
  if (origin) { try { if (new URL(origin).origin !== new URL(request.url).origin) return null; } catch { return null; } }
  return PERSONAL_OWNER_ID;
}
