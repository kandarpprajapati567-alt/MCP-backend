import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSameOriginRequest, PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { hashDeviceSecret } from "@/server/security/device-token";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Pragma": "no-cache" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }

function verifyPairingAdminRequest(request: Request): boolean {
  const expected = process.env.FS_PAIRING_ADMIN_KEY;
  const supplied = request.headers.get("x-fs-pairing-admin-key") ?? "";
  if (!expected || expected.length < 32 || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied, "utf8"), Buffer.from(expected, "utf8"))
    && isSameOriginRequest(request);
}

export async function POST(request: Request) {
  let ownerAuthorized = false;
  try { ownerAuthorized = Boolean(verifyOwnerRequest(request)); } catch { ownerAuthorized = false; }
  if (!ownerAuthorized && !verifyPairingAdminRequest(request)) {
    return json({ error: "Unauthorized. Configure the pairing admin key or connect as owner." }, 401);
  }

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
