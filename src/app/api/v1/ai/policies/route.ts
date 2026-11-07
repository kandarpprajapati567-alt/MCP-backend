import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRuntimeProviderRegistry } from "@/server/ai/providers/runtime-registry";
import type { AIWorkflow, ModelRoutePolicy } from "@/server/ai/routing/types";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const WORKFLOWS: AIWorkflow[] = ["planner", "coding", "research", "summarization", "chat", "notes"];
const PROVIDERS = ["mock", "openai", "openrouter"] as const;
const CAPABILITIES = ["text-generation", "structured-output"] as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

function parsePolicy(body: unknown):
  | { ok: true; value: Omit<ModelRoutePolicy, "requiredCapabilities"> & { workflow: AIWorkflow; requiredCapabilities: string[]; enabled: boolean } }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "A JSON object is required." };
  const input = body as Record<string, unknown>;
  if (typeof input.workflow !== "string" || !WORKFLOWS.includes(input.workflow as AIWorkflow)) {
    return { ok: false, error: "A supported workflow is required." };
  }
  if (typeof input.primaryProvider !== "string" || !PROVIDERS.includes(input.primaryProvider as (typeof PROVIDERS)[number])) {
    return { ok: false, error: "A supported primary provider is required." };
  }
  if (typeof input.primaryModel !== "string" || !input.primaryModel.trim() || input.primaryModel.length > 160) {
    return { ok: false, error: "primaryModel must be 1–160 characters." };
  }
  const fallbacks = input.fallbackProviders ?? [];
  if (!Array.isArray(fallbacks) || fallbacks.length > 2 ||
      fallbacks.some((value) => typeof value !== "string" || !PROVIDERS.includes(value as (typeof PROVIDERS)[number]))) {
    return { ok: false, error: "fallbackProviders must contain at most two supported providers." };
  }
  if (new Set(fallbacks).size !== fallbacks.length || fallbacks.includes(input.primaryProvider)) {
    return { ok: false, error: "Fallback providers must be unique and different from the primary provider." };
  }
  const fallbackModel = input.fallbackModel;
  if (fallbackModel !== undefined && fallbackModel !== null &&
      (typeof fallbackModel !== "string" || fallbackModel.length > 160)) {
    return { ok: false, error: "fallbackModel must be at most 160 characters." };
  }
  const required = input.requiredCapabilities ?? ["text-generation"];
  if (!Array.isArray(required) || required.length < 1 || required.length > 2 ||
      required.some((value) => typeof value !== "string" || !CAPABILITIES.includes(value as (typeof CAPABILITIES)[number]))) {
    return { ok: false, error: "requiredCapabilities contains an unsupported capability." };
  }
  if (new Set(required).size !== required.length) return { ok: false, error: "requiredCapabilities must be unique." };
  const enabled = input.enabled === undefined ? true : input.enabled;
  if (typeof enabled !== "boolean") return { ok: false, error: "enabled must be boolean." };

  return {
    ok: true,
    value: {
      workflow: input.workflow as AIWorkflow,
      primaryProvider: input.primaryProvider,
      primaryModel: input.primaryModel.trim(),
      fallbackProviders: fallbacks as string[],
      ...(typeof fallbackModel === "string" && fallbackModel.trim() ? { fallbackModel: fallbackModel.trim() } : {}),
      requiredCapabilities: required as string[],
      enabled,
    },
  };
}

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  try {
    const admin = createAdminClient();
    const [policyResult, providers] = await Promise.all([
      admin.from("ai_workflow_policies")
        .select("workflow,primary_provider,primary_model,fallback_providers,fallback_model,required_capabilities,enabled,updated_at")
        .eq("owner_id", PERSONAL_OWNER_ID)
        .order("workflow", { ascending: true }),
      createRuntimeProviderRegistry(PERSONAL_OWNER_ID),
    ]);
    if (policyResult.error) return json({ error: "Workflow policies are unavailable." }, 503);
    return json({
      workflows: WORKFLOWS,
      policies: policyResult.data ?? [],
      availableProviders: Object.keys(providers),
    });
  } catch {
    return json({ error: "Workflow policies are temporarily unavailable." }, 503);
  }
}

export async function PUT(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const parsed = parsePolicy(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  try {
    const admin = createAdminClient();
    const { workflow, ...policy } = parsed.value;
    const { data, error } = await admin.from("ai_workflow_policies").upsert({
      owner_id: PERSONAL_OWNER_ID,
      workflow,
      primary_provider: policy.primaryProvider,
      primary_model: policy.primaryModel,
      fallback_providers: policy.fallbackProviders,
      fallback_model: policy.fallbackModel ?? null,
      required_capabilities: policy.requiredCapabilities,
      enabled: policy.enabled,
    }, { onConflict: "owner_id,workflow" })
      .select("workflow,primary_provider,primary_model,fallback_providers,fallback_model,required_capabilities,enabled,updated_at")
      .single();
    if (error || !data) return json({ error: "Workflow policy could not be saved." }, 503);
    return json({ ok: true, policy: data });
  } catch {
    return json({ error: "Workflow policy could not be saved." }, 503);
  }
}

export async function DELETE(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof (body as Record<string, unknown>).workflow !== "string" ||
      !WORKFLOWS.includes((body as Record<string, unknown>).workflow as AIWorkflow)) {
    return json({ error: "A supported workflow is required." }, 400);
  }
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("ai_workflow_policies").delete()
      .eq("owner_id", PERSONAL_OWNER_ID)
      .eq("workflow", (body as { workflow: AIWorkflow }).workflow);
    if (error) return json({ error: "Workflow policy could not be removed." }, 503);
    return json({ ok: true });
  } catch {
    return json({ error: "Workflow policy could not be removed." }, 503);
  }
}
