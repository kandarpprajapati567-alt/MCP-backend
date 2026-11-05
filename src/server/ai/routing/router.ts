import "server-only";

import {
  AIProviderError,
  type AIProvider,
  type AIProviderCapability,
} from "../providers/types";
import type { AIWorkflow, ModelRoute, ModelRoutePolicy, ProviderRegistry } from "./types";

function supportsCapabilities(
  provider: AIProvider,
  required: readonly AIProviderCapability[],
): boolean {
  return required.every((capability) => provider.capabilities.includes(capability));
}

/**
 * Resolves a workflow policy against the providers explicitly registered by
 * the server. It never accepts provider URLs or client-supplied adapter code.
 */
export function resolveModelRoute(
  workflow: AIWorkflow,
  policy: ModelRoutePolicy,
  providers: ProviderRegistry,
): ModelRoute {
  const candidates = [
    { providerId: policy.primaryProvider, isFallback: false },
    ...policy.fallbackProviders.map((providerId) => ({
      providerId,
      isFallback: true,
    })),
  ];

  for (const candidate of candidates) {
    const provider = providers[candidate.providerId];
    if (!provider || !supportsCapabilities(provider, policy.requiredCapabilities)) {
      continue;
    }

    return {
      workflow,
      providerId: provider.id,
      model: candidate.isFallback
        ? policy.fallbackModel ?? policy.primaryModel
        : policy.primaryModel,
      isFallback: candidate.isFallback,
    };
  }

  throw new AIProviderError(
    "PROVIDER_UNAVAILABLE",
    "No configured provider supports the required workflow capabilities.",
    false,
  );
}
