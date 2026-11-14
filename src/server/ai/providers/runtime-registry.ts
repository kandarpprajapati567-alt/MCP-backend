import "server-only";

import type { AIProvider } from "./types";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { createMockAIProvider } from "./mock";
import { loadProviderSecret } from "../secrets/provider-secret-loader";
import type { ProviderRegistry } from "../routing/types";

/**
 * Builds a request-scoped provider registry for one authenticated user.
 * The deterministic Mock provider must remain available even when an optional
 * encrypted provider credential is absent, stale, or cannot be decrypted.
 * Credentials never leave this server-only module.
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

  const [openaiResult, openrouterResult] = await Promise.allSettled([
    loadProviderSecret(userId, "openai"),
    loadProviderSecret(userId, "openrouter"),
  ]);

  if (openaiResult.status === "fulfilled" && openaiResult.value) {
    providers.openai = new OpenAICompatibleProvider("openai", openaiResult.value);
  } else if (openaiResult.status === "rejected") {
    console.warn("[ai-runtime] OpenAI credential unavailable; deterministic Mock remains enabled.");
  }

  if (openrouterResult.status === "fulfilled" && openrouterResult.value) {
    providers.openrouter = new OpenAICompatibleProvider("openrouter", openrouterResult.value);
  } else if (openrouterResult.status === "rejected") {
    console.warn("[ai-runtime] OpenRouter credential unavailable; deterministic Mock remains enabled.");
  }

  return Object.freeze(providers);
}
