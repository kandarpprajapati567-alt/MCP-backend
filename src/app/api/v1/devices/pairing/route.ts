import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { hashDeviceSecret } from "@/server/security/device-token";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Pragma": "no-cache" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);

  try {
    const admin = createAdminClient();
    const pairingCode = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { error } = await admin.from("agent_device_pairing_codes").insert({
      code_hash: hashDeviceSecret(pairingCode),
      owner_id: PERSONAL_OWNER_ID,
      expires_at: expiresAt,
    });
    if (error) return json({ error: "Pairing code could not be created." }, 503);

    // The plaintext code is returned once. Only its SHA-256 hash is stored.
    return json({ ok: true, pairingCode, expiresAt, expiresInSeconds: 300 }, 201);
  } catch {
    return json({ error: "Pairing is temporarily unavailable." }, 503);
  }
}
