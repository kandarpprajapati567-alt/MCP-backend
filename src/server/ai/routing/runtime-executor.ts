import "server-only";

import type { AIGenerationRequest } from "../providers/types";
import { createRuntimeProviderRegistry } from "../providers/runtime-registry";
import { executeWorkflow, type ProviderAttemptObservation } from "./executor";
import type { AIWorkflow, ModelRoutePolicy } from "./types";

const WORKFLOW_MODELS = {
  openai: "gpt-4o-mini",
  openrouter: "openai/gpt-4o-mini",
} as const;

export async function executeUserWorkflow(
  userId: string,
  workflow: AIWorkflow,
  request: AIGenerationRequest,
  onAttempt?: (observation: ProviderAttemptObservation) => void,
) {
  const providers = await createRuntimeProviderRegistry(userId);
  const hasOpenAI = Boolean(providers.openai);
  const hasOpenRouter = Boolean(providers.openrouter);

  let policy: ModelRoutePolicy;
  if (hasOpenAI) {
    policy = {
      primaryProvider: "openai",
      primaryModel: WORKFLOW_MODELS.openai,
      fallbackProviders: hasOpenRouter ? ["openrouter"] : [],
      fallbackModel: WORKFLOW_MODELS.openrouter,
      requiredCapabilities: ["text-generation"],
    };
  } else if (hasOpenRouter) {
    policy = {
      primaryProvider: "openrouter",
      primaryModel: WORKFLOW_MODELS.openrouter,
      fallbackProviders: [],
      requiredCapabilities: ["text-generation"],
    };
  } else {
    policy = {
      primaryProvider: "mock",
      primaryModel: "mock-v1",
      fallbackProviders: [],
      requiredCapabilities: ["text-generation"],
    };
  }

  return executeWorkflow(workflow, policy, providers, request, onAttempt);
}
