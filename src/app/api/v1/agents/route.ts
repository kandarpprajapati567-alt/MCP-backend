import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { parseAgentDefinition } from "@/server/agent/definition-schema";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const columns = "id,name,description,role,instructions,provider_preference,model_preference,allowed_tools,max_steps,max_tool_calls,enabled,created_at,updated_at";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("agent_definitions")
      .select(columns)
      .eq("owner_id", PERSONAL_OWNER_ID)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) return json({ error: "Agent definitions are unavailable." }, 503);
    return json({ agents: data ?? [], count: data?.length ?? 0 });
  } catch {
    return json({ error: "Agent definitions are temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 20000) return json({ error: "Request body too large." }, 413);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const parsed = parseAgentDefinition(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  try {
    const admin = createAdminClient();
    const value = parsed.value;
    const { data, error } = await admin.from("agent_definitions").insert({
      owner_id: PERSONAL_OWNER_ID,
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
    }).select(columns).single();
    if (error || !data) {
      if (error?.code === "23505") return json({ error: "An agent with this name already exists." }, 409);
      return json({ error: "Agent could not be created." }, 503);
    }
    return json({ ok: true, agent: data }, 201);
  } catch {
    return json({ error: "Agent could not be created." }, 503);
  }
}
