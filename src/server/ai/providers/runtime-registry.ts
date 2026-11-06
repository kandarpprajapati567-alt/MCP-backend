import "server-only";

import type { AIProvider } from "./types";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { createMockAIProvider } from "./mock";
import { loadProviderSecret } from "../secrets/provider-secret-loader";
import type { ProviderRegistry } from "../routing/types";

/**
 * Builds a request-scoped provider registry for one authenticated user.
 * Only fixed, supported adapters are created; credentials never leave this
 * server-only module and callers cannot provide provider URLs or adapter code.
 */
export async function createRuntimeProviderRegistry(
  userId: string,
): Promise<ProviderRegistry> {
  if (!userId || typeof userId !== "string") {
    throw new Error("An authenticated user is required.");
  }

  const providers: Record<string, AIProvider> = {
    mock: createMockAIProvider(),
  };

  const [openaiKey, openrouterKey] = await Promise.all([
    loadProviderSecret(userId, "openai"),
    loadProviderSecret(userId, "openrouter"),
  ]);

  if (openaiKey) {
    providers.openai = new OpenAICompatibleProvider("openai", openaiKey);
  }
  if (openrouterKey) {
    providers.openrouter = new OpenAICompatibleProvider("openrouter", openrouterKey);
  }

  return Object.freeze(providers);
}
