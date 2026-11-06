import {
  AIProviderError,
  type AIGenerationRequest,
  type AIGenerationResult,
  type AIProvider,
  type AIProviderErrorCode,
} from "../providers/types";
import type { AIWorkflow, ModelRoute, ModelRoutePolicy, ProviderRegistry } from "./types";
import { resolveModelRoute } from "./router";

export type ProviderAttemptObservation = {
  providerId: string;
  outcome: "success" | "failure";
  latencyMs: number;
  errorCode?: AIProviderErrorCode;
};

function compatible(provider: AIProvider, policy: ModelRoutePolicy): boolean {
  return policy.requiredCapabilities.every((capability) =>
    provider.capabilities.includes(capability),
  );
}

export async function executeWorkflow(
  workflow: AIWorkflow,
  policy: ModelRoutePolicy,
  providers: ProviderRegistry,
  request: AIGenerationRequest,
  onAttempt?: (observation: ProviderAttemptObservation) => void,
): Promise<{ route: ModelRoute; result: AIGenerationResult }> {
  const firstRoute = resolveModelRoute(workflow, policy, providers);
  const orderedRoutes: ModelRoute[] = [firstRoute];

  if (!firstRoute.isFallback) {
    for (const providerId of policy.fallbackProviders) {
      const provider = providers[providerId];
      if (!provider || !compatible(provider, policy)) continue;
      orderedRoutes.push({
        workflow,
        providerId,
        model: policy.fallbackModel ?? policy.primaryModel,
        isFallback: true,
      });
    }
  }

  let lastRetryableError: AIProviderError | undefined;
  for (const route of orderedRoutes) {
    const provider = providers[route.providerId];
    if (!provider) continue;

    const startedAt = Date.now();
    let observation: ProviderAttemptObservation = {
      providerId: route.providerId, outcome: "failure", latencyMs: 0, errorCode: "UNKNOWN",
    };
    try {
      const result = await provider.generate({ ...request, model: route.model });
      observation = {
        providerId: route.providerId,
        outcome: "success",
        latencyMs: Math.min(300000, Math.max(0, Date.now() - startedAt)),
      };
      return { route, result };
    } catch (cause) {
      if (!(cause instanceof AIProviderError)) throw cause;
      observation = {
        providerId: route.providerId,
        outcome: "failure",
        latencyMs: Math.min(300000, Math.max(0, Date.now() - startedAt)),
        errorCode: cause.code,
      };
      if (!cause.retryable) throw cause;
      lastRetryableError = cause;
    } finally {
      try { onAttempt?.(observation); } catch { /* Monitoring must not affect generation. */ }
    }
  }

  throw lastRetryableError ?? new AIProviderError(
    "PROVIDER_UNAVAILABLE",
    "No configured provider could execute this workflow.",
    false,
  );
}
