import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { parseAgentDefinition } from "@/server/agent/definition-schema";
import { readJsonBody } from "@/server/http/read-json";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const columns = "id,name,description,role,instructions,provider_preference,model_preference,allowed_tools,max_steps,max_tool_calls,enabled,created_at,updated_at";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

type Context = { params: Promise<{ agentId: string }> };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function PATCH(request: Request, context: Context) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const { agentId } = await context.params;
  if (!isUuid(agentId)) return json({ error: "A valid agent ID is required." }, 400);
  const parsedBody = await readJsonBody(request, 20000);
  if (!parsedBody.ok) return parsedBody.reason === "too_large"
    ? json({ error: "Request body too large." }, 413)
    : json({ error: "Invalid JSON body." }, 400);
  const body = parsedBody.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "A JSON object is required." }, 400);

  try {
    const admin = createAdminClient();
    const { data: existing, error: readError } = await admin.from("agent_definitions")
      .select(columns).eq("owner_id", PERSONAL_OWNER_ID).eq("id", agentId).maybeSingle();
    if (readError) return json({ error: "Agent could not be loaded." }, 503);
    if (!existing) return json({ error: "Agent not found." }, 404);

    const input = body as Record<string, unknown>;
    const merged = {
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      role: input.role ?? existing.role,
      instructions: input.instructions ?? existing.instructions,
      providerPreference: input.providerPreference ?? existing.provider_preference,
      modelPreference: input.modelPreference === undefined ? existing.model_preference : input.modelPreference,
      allowedTools: input.allowedTools ?? existing.allowed_tools,
      maxSteps: input.maxSteps ?? existing.max_steps,
      maxToolCalls: input.maxToolCalls ?? existing.max_tool_calls,
      enabled: input.enabled ?? existing.enabled,
    };
    const parsed = parseAgentDefinition(merged);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const value = parsed.value;
    const { data, error } = await admin.from("agent_definitions").update({
      name: value.name,
      description: value.description,
      role: value.role,
      instructions: value.instructions,
      provider_preference: value.providerPreference,
      model_preference: value.modelPreference,
      allowed_tools: value.allowedTools,
      max_steps: value.maxSteps,
      max_tool_calls: value.maxToolCalls,
      enabled: value.enabled,
    }).eq("owner_id", PERSONAL_OWNER_ID).eq("id", agentId).select(columns).single();
    if (error || !data) {
      if (error?.code === "23505") return json({ error: "An agent with this name already exists." }, 409);
      return json({ error: "Agent could not be updated." }, 503);
    }
    return json({ ok: true, agent: data });
  } catch {
    return json({ error: "Agent could not be updated." }, 503);
  }
}

export async function DELETE(request: Request, context: Context) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const { agentId } = await context.params;
  if (!isUuid(agentId)) return json({ error: "A valid agent ID is required." }, 400);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("agent_definitions").delete()
      .eq("owner_id", PERSONAL_OWNER_ID).eq("id", agentId).select("id");
    if (error) return json({ error: "Agent could not be deleted." }, 503);
    if (!data?.length) return json({ error: "Agent not found." }, 404);
    return json({ ok: true, deleted: true });
  } catch {
    return json({ error: "Agent could not be deleted." }, 503);
  }
}
