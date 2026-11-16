import type { AgentProviderPreference } from "@/server/agent/definition-schema";
import type { ModelRoutePolicy } from "./types";

const MOCK_MODEL = "mock-v1";

/**
 * A currently published $0 OpenRouter reasoning model. Keep this as a
 * replaceable default: free model availability and rate limits can change.
 */
export const DEFAULT_FREE_OPENROUTER_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

function isFreeOpenRouterModel(model: string): boolean {
  return model.includes("/") && model.endsWith(":free") && !/\\s/.test(model);
}

/**
 * This deployment is zero-budget: automatic Agent routing prefers an
 * available OpenRouter free model. Explicit paid model preferences fail
 * closed to Mock; no paid provider is selected by this function.
 */
export function selectAgentExecutionRoute(
  preference: AgentProviderPreference,
  modelPreference: string | null,
  basePolicy: ModelRoutePolicy,
  availableProviders: readonly string[],
): { providerId: "mock" | "openrouter"; model: string } {
  const autoFreeAvailable = preference === "auto" && availableProviders.includes("openrouter");
  const requestedProvider = autoFreeAvailable
    ? "openrouter"
    : preference === "auto" ? basePolicy.primaryProvider : preference;
  const configuredBaseIsFree = basePolicy.primaryProvider === "openrouter" &&
    isFreeOpenRouterModel(basePolicy.primaryModel);
  const requestedModel = modelPreference?.trim() ||
    (requestedProvider === "openrouter"
      ? configuredBaseIsFree ? basePolicy.primaryModel : DEFAULT_FREE_OPENROUTER_MODEL
      : requestedProvider === basePolicy.primaryProvider
        ? basePolicy.primaryModel
        : MOCK_MODEL);

  if (requestedProvider === "openrouter" && isFreeOpenRouterModel(requestedModel) &&
      availableProviders.includes("openrouter")) {
    return { providerId: "openrouter", model: requestedModel };
  }
  return { providerId: "mock", model: MOCK_MODEL };
}
