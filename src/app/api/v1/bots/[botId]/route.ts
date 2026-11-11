import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { parseBotDefinition } from "@/server/bot/definition-schema";
import { readJsonBody } from "@/server/http/read-json";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const columns = "id,name,description,persona_instructions,agent_ids,default_agent_id,provider_preference,model_preference,allowed_tools,enabled,created_at,updated_at";
const mutable = new Set(["name","description","personaInstructions","agentIds","defaultAgentId","providerPreference","modelPreference","allowedTools","enabled"]);
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }
type Context = { params: Promise<{ botId: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

async function validateAssignedAgents(admin: ReturnType<typeof createAdminClient>, ids: string[]) {
  const { data, error } = await admin.from("agent_definitions").select("id")
    .eq("owner_id", PERSONAL_OWNER_ID).eq("enabled", true).in("id", ids);
  if (error) return { ok: false as const, status: 503, error: "Assigned Agents are unavailable." };
  if ((data ?? []).length !== ids.length) return { ok: false as const, status: 400, error: "Every assigned Agent must exist and be enabled." };
  return { ok: true as const };
}

export async function PATCH(request: Request, context: Context) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const { botId } = await context.params;
  if (!uuid.test(botId)) return json({ error: "A valid Bot ID is required." }, 400);
  const parsedBody = await readJsonBody(request, 24000);
  if (!parsedBody.ok) return parsedBody.reason === "too_large" ? json({ error: "Request body too large." }, 413) : json({ error: "Invalid JSON body." }, 400);
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) return json({ error: "A JSON object is required." }, 400);
  const input = parsedBody.value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !mutable.has(key))) return json({ error: "Bot definition contains unsupported fields." }, 400);
  if (!Object.keys(input).length) return json({ error: "At least one Bot field is required." }, 400);
  try {
    const admin = createAdminClient();
    const { data: existing, error: readError } = await admin.from("bot_definitions").select(columns)
      .eq("owner_id", PERSONAL_OWNER_ID).eq("id", botId).maybeSingle();
    if (readError) return json({ error: "Bot could not be loaded." }, 503);
    if (!existing) return json({ error: "Bot not found." }, 404);
    const merged = {
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      personaInstructions: input.personaInstructions ?? existing.persona_instructions,
      agentIds: input.agentIds ?? existing.agent_ids,
      defaultAgentId: input.defaultAgentId === undefined ? existing.default_agent_id : input.defaultAgentId,
      providerPreference: input.providerPreference ?? existing.provider_preference,
      modelPreference: input.modelPreference === undefined ? existing.model_preference : input.modelPreference,
      allowedTools: input.allowedTools ?? existing.allowed_tools,
      enabled: input.enabled ?? existing.enabled,
    };
    const parsed = parseBotDefinition(merged);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const assigned = await validateAssignedAgents(admin, parsed.value.agentIds);
    if (!assigned.ok) return json({ error: assigned.error }, assigned.status);
    const value = parsed.value;
    const { data, error } = await admin.from("bot_definitions").update({
      name: value.name, description: value.description, persona_instructions: value.personaInstructions,
      agent_ids: value.agentIds, default_agent_id: value.defaultAgentId, provider_preference: value.providerPreference,
      model_preference: value.modelPreference, allowed_tools: value.allowedTools, enabled: value.enabled,
    }).eq("owner_id", PERSONAL_OWNER_ID).eq("id", botId).select(columns).single();
    if (error || !data) {
      if (error?.code === "23505") return json({ error: "A Bot with this name already exists." }, 409);
      return json({ error: "Bot could not be updated." }, 503);
    }
    return json({ ok: true, bot: data });
  } catch { return json({ error: "Bot could not be updated." }, 503); }
}

export async function DELETE(request: Request, context: Context) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const { botId } = await context.params;
  if (!uuid.test(botId)) return json({ error: "A valid Bot ID is required." }, 400);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("bot_definitions").delete()
      .eq("owner_id", PERSONAL_OWNER_ID).eq("id", botId).select("id");
    if (error) return json({ error: "Bot could not be deleted." }, 503);
    if (!data?.length) return json({ error: "Bot not found." }, 404);
    return json({ ok: true, deleted: true });
  } catch { return json({ error: "Bot could not be deleted." }, 503); }
}
