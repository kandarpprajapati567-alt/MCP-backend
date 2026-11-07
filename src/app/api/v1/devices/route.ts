import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseDeviceRegistration } from "@/server/agent/device-contract";
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
      .eq("owner_id", PERSONAL_OWNER_ID)
      .order("last_seen_at", { ascending: false });
    if (error) return json({ error: "Device registry is unavailable." }, 503);
    return json({ devices: data ?? [] });
  } catch {
    return json({ error: "Device registry is temporarily unavailable." }, 503);
  }
}

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
      owner_id: PERSONAL_OWNER_ID,
      device_id: device.deviceId,
      display_name: device.displayName,
      platform: device.platform,
      app_version: device.appVersion ?? null,
      capabilities: device.capabilities,
      status: "online",
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "owner_id,device_id" })
      .select("id,device_id,display_name,platform,app_version,capabilities,status,last_seen_at,updated_at")
      .single();
    if (error || !data) return json({ error: "Device could not be registered." }, 503);
    return json({ ok: true, device: data }, 201);
  } catch {
    return json({ error: "Device could not be registered." }, 503);
  }
}

export async function DELETE(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof (body as Record<string, unknown>).deviceId !== "string") {
    return json({ error: "deviceId is required." }, 400);
  }
  const deviceId = (body as { deviceId: string }).deviceId;
  if (!deviceId.trim() || deviceId.length > 128) return json({ error: "Invalid deviceId." }, 400);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("agent_devices").update({
      status: "offline",
      updated_at: new Date().toISOString(),
    }).eq("owner_id", PERSONAL_OWNER_ID).eq("device_id", deviceId).select("device_id").maybeSingle();
    if (error) return json({ error: "Device status could not be updated." }, 503);
    return json({ ok: true, offline: Boolean(data) });
  } catch {
    return json({ error: "Device status could not be updated." }, 503);
  }
}
