import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuthenticatedDevice = { ownerId: string; deviceId: string };

export function hashDeviceSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function equalDeviceSecret(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Device credentials are scoped to exactly one registered device. */
export async function verifyDeviceRequest(request: Request): Promise<AuthenticatedDevice | null> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(fsd_[A-Za-z0-9_-]{40,})$/i)?.[1];
  if (!token) return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("agent_device_credentials")
      .select("owner_id,device_id")
      .eq("token_hash", hashDeviceSecret(token))
      .is("revoked_at", null)
      .maybeSingle();
    if (error || !data) return null;
    await admin.from("agent_device_credentials")
      .update({ last_used_at: new Date().toISOString() })
      .eq("token_hash", hashDeviceSecret(token))
      .is("revoked_at", null);
    return { ownerId: data.owner_id, deviceId: data.device_id };
  } catch {
    return null;
  }
}
