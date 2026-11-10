import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AIGenerationRequest, AIProviderCapability } from "../providers/types";
import type { AgentProviderPreference } from "@/server/agent/definition-schema";
import { createRuntimeProviderRegistry } from "../providers/runtime-registry";
import { executeWorkflow, type ProviderAttemptObservation } from "./executor";
import type { AIWorkflow, ModelRoutePolicy, ProviderRegistry } from "./types";

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  openrouter: "openai/gpt-4o-mini",
  mock: "mock-v1",
};
const PROVIDERS = ["mock", "openai", "openrouter"] as const;
const CAPABILITIES = ["text-generation", "structured-output"] as const;

function defaultPolicy(providers: ProviderRegistry): ModelRoutePolicy {
  const primaryProvider = providers.openai ? "openai" : providers.openrouter ? "openrouter" : "mock";
  const fallbackProviders = primaryProvider === "openai" && providers.openrouter
    ? ["openrouter", "mock"]
    : primaryProvider === "openrouter" || primaryProvider === "openai" ? ["mock"] : [];
  return {
    primaryProvider,
    primaryModel: DEFAULT_MODELS[primaryProvider],
    fallbackProviders,
    fallbackModel: DEFAULT_MODELS.openrouter,
    requiredCapabilities: ["text-generation"],
  };
}

export async function getUserWorkflowPolicy(
  userId: string,
  workflow: AIWorkflow,
  providers?: ProviderRegistry,
): Promise<ModelRoutePolicy> {
  if (!userId) throw new Error("An owner id is required.");
  const registry = providers ?? await createRuntimeProviderRegistry(userId);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_workflow_policies")
    .select("primary_provider,primary_model,fallback_providers,fallback_model,required_capabilities,enabled")
    .eq("owner_id", userId)
    .eq("workflow", workflow)
    .maybeSingle();

  if (error) throw new Error("Workflow policy could not be loaded.");
  if (!data || data.enabled !== true) return defaultPolicy(registry);

  const primaryProvider = typeof data.primary_provider === "string" && PROVIDERS.includes(data.primary_provider as (typeof PROVIDERS)[number])
    ? data.primary_provider : "mock";
  const configuredFallbacks = Array.isArray(data.fallback_providers)
    ? data.fallback_providers.filter((value: unknown): value is string =>
        typeof value === "string" && PROVIDERS.includes(value as (typeof PROVIDERS)[number]) && value !== primaryProvider)
    : [];
  const fallbackProviders = [...new Set([...configuredFallbacks, ...(primaryProvider === "mock" ? [] : ["mock"])])];
  const requiredCapabilities = Array.isArray(data.required_capabilities)
    ? data.required_capabilities.filter((value: unknown): value is AIProviderCapability =>
        typeof value === "string" && CAPABILITIES.includes(value as (typeof CAPABILITIES)[number]))
    : ["text-generation" as const];

  return {
    primaryProvider,
    primaryModel: typeof data.primary_model === "string" ? data.primary_model : DEFAULT_MODELS[primaryProvider],
    fallbackProviders,
    ...(typeof data.fallback_model === "string" && data.fallback_model ? { fallbackModel: data.fallback_model } : {}),
    requiredCapabilities: requiredCapabilities.length ? requiredCapabilities : ["text-generation"],
  };
}

export async function executeUserWorkflow(
  userId: string,
  workflow: AIWorkflow,
  request: AIGenerationRequest,
  onAttempt?: (observation: ProviderAttemptObservation) => void,
) {
  const providers = await createRuntimeProviderRegistry(userId);
  const policy = await getUserWorkflowPolicy(userId, workflow, providers);
  return executeWorkflow(workflow, policy, providers, request, onAttempt);
}


export async function executeAgentWorkflow(
  userId: string,
  workflow: AIWorkflow,
  request: AIGenerationRequest,
  preferences: { providerPreference: AgentProviderPreference; modelPreference: string | null },
  onAttempt?: (observation: ProviderAttemptObservation) => void,
) {
  const providers = await createRuntimeProviderRegistry(userId);
  const basePolicy = await getUserWorkflowPolicy(userId, workflow, providers);
  const providerId = preferences.providerPreference === "auto"
    ? basePolicy.primaryProvider
    : preferences.providerPreference;
  if (!providers[providerId]) {
    throw new Error("The Agent's selected AI provider is not configured.");
  }

  const fallbackProviders = [...new Set([
    ...basePolicy.fallbackProviders.filter((id) => id !== providerId),
    ...(providerId === "mock" ? [] : ["mock"]),
  ])];
  const policy: ModelRoutePolicy = {
    ...basePolicy,
    primaryProvider: providerId,
    primaryModel: providerId === "mock" ? DEFAULT_MODELS.mock :
      preferences.modelPreference?.trim() ||
      (providerId === basePolicy.primaryProvider ? basePolicy.primaryModel : DEFAULT_MODELS[providerId]),
    fallbackProviders,
  };
  return executeWorkflow(workflow, policy, providers, request, onAttempt);
}
