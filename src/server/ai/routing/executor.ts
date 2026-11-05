import "server-only";

import {
  AIProviderError,
  type AIGenerationRequest,
  type AIGenerationResult,
  type AIProvider,
} from "../providers/types";
import type { AIWorkflow, ModelRoute, ModelRoutePolicy, ProviderRegistry } from "./types";
import { resolveModelRoute } from "./router";

function compatible(provider: AIProvider, policy: ModelRoutePolicy): boolean {
  return policy.requiredCapabilities.every((capability) =>
    provider.capabilities.includes(capability),
  );
}

/**
 * Executes a workflow using server-registered providers only.
 * Fallback is attempted only after a retryable provider failure; validation
 * and authentication errors are returned immediately.
 */
export async function executeWorkflow(
  workflow: AIWorkflow,
  policy: ModelRoutePolicy,
  providers: ProviderRegistry,
  request: AIGenerationRequest,
): Promise<{ route: ModelRoute; result: AIGenerationResult }> {
  const firstRoute = resolveModelRoute(workflow, policy, providers);
  const orderedRoutes: ModelRoute[] = [firstRoute];

  if (!firstRoute.isFallback) {
    for (const providerId of policy.fallbackProviders) {
      const provider = providers[providerId];
      if (!provider || !compatible(provider, policy)) continue;
      orderedRoutes.push({
        workflow,
        providerId: provider.id,
        model: policy.fallbackModel ?? policy.primaryModel,
        isFallback: true,
      });
    }
  }

  let lastRetryableError: AIProviderError | undefined;
  for (const route of orderedRoutes) {
    const provider = providers[route.providerId];
    if (!provider) continue;

    try {
      const result = await provider.generate({ ...request, model: route.model });
      return { route, result };
    } catch (cause) {
      if (!(cause instanceof AIProviderError) || !cause.retryable) throw cause;
      lastRetryableError = cause;
    }
  }

  throw lastRetryableError ?? new AIProviderError(
    "PROVIDER_UNAVAILABLE",
    "No configured provider could execute this workflow.",
    false,
  );
}
