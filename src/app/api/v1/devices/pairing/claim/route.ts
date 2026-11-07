import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseDeviceRegistration } from "@/server/agent/device-contract";
import { PERSONAL_OWNER_ID } from "@/server/security/owner-auth";
import { hashDeviceSecret } from "@/server/security/device-token";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Pragma": "no-cache" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "A JSON object is required." }, 400);
  const input = body as Record<string, unknown>;
  if (typeof input.pairingCode !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(input.pairingCode)) {
    return json({ error: "A valid pairingCode is required." }, 400);
  }

  const parsed = parseDeviceRegistration(input);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  try {
    const admin = createAdminClient();
    const deviceToken = "fsd_" + randomBytes(32).toString("base64url");
    const device = parsed.value;
    const { data, error } = await admin.rpc("claim_agent_device_pairing", {
      p_code_hash: hashDeviceSecret(input.pairingCode),
      p_owner_id: PERSONAL_OWNER_ID,
      p_device_id: device.deviceId,
      p_display_name: device.displayName,
      p_platform: device.platform,
      p_app_version: device.appVersion ?? null,
      p_capabilities: device.capabilities,
      p_token_hash: hashDeviceSecret(deviceToken),
    });
    if (error || !data) {
      const invalid = error?.message?.includes("PAIRING_CODE_INVALID_OR_EXPIRED");
      return json({ error: invalid ? "Pairing code is invalid, expired or already used." : "Device pairing could not be completed." }, invalid ? 410 : 503);
    }

    // Device token is shown only once; database stores only its hash.
    return json({ ok: true, device: data, deviceToken, tokenType: "Bearer" }, 201);
  } catch {
    return json({ error: "Device pairing is temporarily unavailable." }, 503);
  }
}
