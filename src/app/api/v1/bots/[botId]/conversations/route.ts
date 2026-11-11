import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: { params: Promise<{ botId: string }> }) {
  if (!verifyOwnerRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { botId } = await context.params;
  if (!uuid.test(botId)) return NextResponse.json({ error: "A valid Bot ID is required." }, { status: 400 });
  const admin = createAdminClient();
  const { data: bot, error: botError } = await admin.from("bot_definitions").select("id")
    .eq("owner_id", PERSONAL_OWNER_ID).eq("id", botId).maybeSingle();
  if (botError) return NextResponse.json({ error: "Bot configuration is unavailable." }, { status: 503 });
  if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
  const { data, error } = await admin.from("bot_conversations")
    .select("id,last_agent_id,last_task_id,status,created_at,updated_at")
    .eq("owner_id", PERSONAL_OWNER_ID).eq("bot_id", botId)
    .order("updated_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "Bot conversation history is unavailable." }, { status: 503 });
  return NextResponse.json({ conversations: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}
