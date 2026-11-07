import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseDeviceRegistration } from "@/server/agent/device-contract";
import { verifyDeviceRequest } from "@/server/security/device-auth";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("agent_devices")
      .select("id,device_id,display_name,platform,app_version,capabilities,status,last_seen_at,created_at,updated_at")
      .eq("owner_id", PERSONAL_OWNER_ID).order("last_seen_at", { ascending: false });
    if (error) return json({ error: "Device registry is unavailable." }, 503);
    return json({ devices: data ?? [] });
  } catch { return json({ error: "Device registry is temporarily unavailable." }, 503); }
}

// Owner-only administrative registration remains available for trusted server operations.
export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const parsed = parseDeviceRegistration(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  try {
    const admin = createAdminClient();
    const device = parsed.value;
    const { data, error } = await admin.from("agent_devices").upsert({
      owner_id: PERSONAL_OWNER_ID, device_id: device.deviceId, display_name: device.displayName,
      platform: device.platform, app_version: device.appVersion ?? null, capabilities: device.capabilities,
      status: "online", last_seen_at: new Date().toISOString(),
    }, { onConflict: "owner_id,device_id" })
      .select("id,device_id,display_name,platform,app_version,capabilities,status,last_seen_at,updated_at").single();
    if (error || !data) return json({ error: "Device could not be registered." }, 503);
    return json({ ok: true, device: data }, 201);
  } catch { return json({ error: "Device could not be registered." }, 503); }
}

// A paired device may refresh only its own metadata and capability manifest.
export async function PUT(request: Request) {
  const authenticated = await verifyDeviceRequest(request);
  if (!authenticated) return json({ error: "Device authentication required." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const parsed = parseDeviceRegistration(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  if (parsed.value.deviceId !== authenticated.deviceId) return json({ error: "Credential is not valid for this deviceId." }, 403);
  try {
    const admin = createAdminClient();
    const device = parsed.value;
    const { data, error } = await admin.from("agent_devices").update({
      display_name: device.displayName, platform: device.platform, app_version: device.appVersion ?? null,
      capabilities: device.capabilities, status: "online", last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("owner_id", authenticated.ownerId).eq("device_id", authenticated.deviceId)
      .select("device_id,display_name,platform,app_version,capabilities,status,last_seen_at,updated_at").maybeSingle();
    if (error) return json({ error: "Device could not be updated." }, 503);
    if (!data) return json({ error: "Device is not registered." }, 404);
    return json({ ok: true, device: data });
  } catch { return json({ error: "Device could not be updated." }, 503); }
}

// Revocation is owner-only and invalidates every credential for the selected device.
export async function DELETE(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof (body as Record<string, unknown>).deviceId !== "string") return json({ error: "deviceId is required." }, 400);
  const deviceId = (body as { deviceId: string }).deviceId;
  if (!deviceId.trim() || deviceId.length > 128) return json({ error: "Invalid deviceId." }, 400);
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { error: revokeError } = await admin.from("agent_device_credentials")
      .update({ revoked_at: now }).eq("owner_id", PERSONAL_OWNER_ID).eq("device_id", deviceId).is("revoked_at", null);
    if (revokeError) return json({ error: "Device credentials could not be revoked." }, 503);
    const { data, error } = await admin.from("agent_devices").update({ status: "offline", updated_at: now })
      .eq("owner_id", PERSONAL_OWNER_ID).eq("device_id", deviceId).select("device_id").maybeSingle();
    if (error) return json({ error: "Device status could not be updated." }, 503);
    return json({ ok: true, revoked: Boolean(data), deviceId });
  } catch { return json({ error: "Device status could not be updated." }, 503); }
}
