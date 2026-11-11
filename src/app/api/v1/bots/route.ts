import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { parseBotDefinition } from "@/server/bot/definition-schema";
import { readJsonBody } from "@/server/http/read-json";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const columns = "id,name,description,persona_instructions,agent_ids,default_agent_id,provider_preference,model_preference,allowed_tools,enabled,created_at,updated_at";
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }

async function validateAssignedAgents(admin: ReturnType<typeof createAdminClient>, ids: string[]) {
  const { data, error } = await admin.from("agent_definitions").select("id")
    .eq("owner_id", PERSONAL_OWNER_ID).eq("enabled", true).in("id", ids);
  if (error) return { ok: false as const, status: 503, error: "Assigned Agents are unavailable." };
  if ((data ?? []).length !== ids.length) return { ok: false as const, status: 400, error: "Every assigned Agent must exist and be enabled." };
  return { ok: true as const };
}

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("bot_definitions").select(columns)
      .eq("owner_id", PERSONAL_OWNER_ID).order("updated_at", { ascending: false }).limit(100);
    if (error) return json({ error: "Bot definitions are unavailable." }, 503);
    return json({ bots: data ?? [], count: data?.length ?? 0 });
  } catch { return json({ error: "Bot definitions are temporarily unavailable." }, 503); }
}

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const body = await readJsonBody(request, 24000);
  if (!body.ok) return body.reason === "too_large" ? json({ error: "Request body too large." }, 413) : json({ error: "Invalid JSON body." }, 400);
  const parsed = parseBotDefinition(body.value);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  try {
    const admin = createAdminClient();
    const assigned = await validateAssignedAgents(admin, parsed.value.agentIds);
    if (!assigned.ok) return json({ error: assigned.error }, assigned.status);
    const value = parsed.value;
    const { data, error } = await admin.from("bot_definitions").insert({
      owner_id: PERSONAL_OWNER_ID,
      name: value.name,
      description: value.description,
      persona_instructions: value.personaInstructions,
      agent_ids: value.agentIds,
      default_agent_id: value.defaultAgentId,
      provider_preference: value.providerPreference,
      model_preference: value.modelPreference,
      allowed_tools: value.allowedTools,
      enabled: value.enabled,
    }).select(columns).single();
    if (error || !data) {
      if (error?.code === "23505") return json({ error: "A Bot with this name already exists." }, 409);
      return json({ error: "Bot could not be created." }, 503);
    }
    return json({ ok: true, bot: data }, 201);
  } catch { return json({ error: "Bot could not be created." }, 503); }
}
