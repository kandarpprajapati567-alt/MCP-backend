import "server-only";

import {
  type AIProvider,
  type AIGenerationRequest,
  type AIGenerationResult,
} from "./types";

/**
 * Deterministic provider used to verify the provider contract without making
 * network requests or consuming a user's API credits.
 */
export class MockAIProvider implements AIProvider {
  readonly id = "mock";
  readonly capabilities = ["text-generation"] as const;

  async generate(request: AIGenerationRequest): Promise<AIGenerationResult> {
    const lastUserMessage = [...request.messages]
      .reverse()
      .find((message) => message.role === "user");

    return {
      provider: this.id,
      model: request.model ?? "mock-v1",
      text: lastUserMessage
        ? `Mock provider received your message: ${lastUserMessage.content.slice(0, 500)}`
        : "Mock provider is ready.",
      finishReason: "stop",
      usage: {
        inputTokens: request.messages.reduce(
          (total, message) => total + Math.ceil(message.content.length / 4),
          0,
        ),
        outputTokens: 8,
      },
      requestId: crypto.randomUUID(),
    };
  }
}

export function createMockAIProvider(): AIProvider {
  return new MockAIProvider();
}
