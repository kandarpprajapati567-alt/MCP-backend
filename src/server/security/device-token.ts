import { createHash, timingSafeEqual } from "node:crypto";

export function hashDeviceSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function equalDeviceSecret(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isDeviceBearerToken(value: unknown): value is string {
  return typeof value === "string" && /^fsd_[A-Za-z0-9_-]{40,64}$/.test(value);
}
