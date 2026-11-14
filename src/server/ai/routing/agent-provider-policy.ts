import type { AgentProviderPreference } from "@/server/agent/definition-schema";
import type { ModelRoutePolicy } from "./types";

const MOCK_MODEL = "mock-v1";

/**
 * This deployment is zero-budget: remote inference is permitted only for an
 * explicitly selected OpenRouter model marked :free. Every other preference
 * resolves to the deterministic Mock provider.
 */
export function selectAgentExecutionRoute(
  preference: AgentProviderPreference,
  modelPreference: string | null,
  basePolicy: ModelRoutePolicy,
  availableProviders: readonly string[],
): { providerId: "mock" | "openrouter"; model: string } {
  const requestedProvider = preference === "auto" ? basePolicy.primaryProvider : preference;
  const requestedModel = modelPreference?.trim() ||
    (requestedProvider === basePolicy.primaryProvider
      ? basePolicy.primaryModel
      : requestedProvider === "openrouter" ? "openai/gpt-4o-mini" : MOCK_MODEL);

  if (requestedProvider === "openrouter" && requestedModel.includes("/") &&
      requestedModel.endsWith(":free") && !/\s/.test(requestedModel) &&
      availableProviders.includes("openrouter")) {
    return { providerId: "openrouter", model: requestedModel };
  }
  return { providerId: "mock", model: MOCK_MODEL };
}
