import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { hashDeviceSecret, isDeviceBearerToken } from "./device-token";

export type AuthenticatedDevice = { ownerId: string; deviceId: string };

/** Device credentials are scoped to exactly one registered device. */
export async function verifyDeviceRequest(request: Request): Promise<AuthenticatedDevice | null> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(fsd_[A-Za-z0-9_-]{40,64})$/i)?.[1];
  if (!isDeviceBearerToken(token)) return null;

  try {
    const admin = createAdminClient();
    const tokenHash = hashDeviceSecret(token);
    const { data, error } = await admin.from("agent_device_credentials")
      .select("owner_id,device_id")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();
    if (error || !data) return null;
    await admin.from("agent_device_credentials")
      .update({ last_used_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)
      .is("revoked_at", null);
    return { ownerId: data.owner_id, deviceId: data.device_id };
  } catch {
    return null;
  }
}
