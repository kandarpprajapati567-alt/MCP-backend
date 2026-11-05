import "server-only";

import {
  AIProviderError,
  type AIGenerationRequest,
  type AIGenerationResult,
  type AIProvider,
} from "./types";

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_TOTAL_LENGTH = 12_000;

export class MockAIProvider implements AIProvider {
  readonly id = "mock";
  readonly capabilities = ["text-generation"] as const;

  async generate(request: AIGenerationRequest): Promise<AIGenerationResult> {
    if (!request || !Array.isArray(request.messages)) {
      throw new AIProviderError("INVALID_REQUEST", "A valid messages array is required.");
    }

    if (request.messages.length < 1 || request.messages.length > MAX_MESSAGES) {
      throw new AIProviderError("INVALID_REQUEST", "Message count is outside the allowed range.");
    }

    let totalLength = 0;
    for (const message of request.messages) {
      if (
        !message ||
        !["system", "user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" ||
        message.content.length > MAX_MESSAGE_LENGTH
      ) {
        throw new AIProviderError("INVALID_REQUEST", "A message is invalid or too large.");
      }
      totalLength += message.content.length;
    }

    if (totalLength > MAX_TOTAL_LENGTH) {
      throw new AIProviderError("INVALID_REQUEST", "Request content is too large.");
    }

    const latestUserMessage = [...request.messages]
      .reverse()
      .find((message) => message.role === "user");

    if (!latestUserMessage) {
      throw new AIProviderError("INVALID_REQUEST", "At least one user message is required.");
    }

    return {
      provider: this.id,
      model: "mock-deterministic-v1",
      text: `Mock provider received your request: ${latestUserMessage.content}`,
      finishReason: "stop",
      usage: {
        inputTokens: Math.ceil(totalLength / 4),
        outputTokens: Math.ceil(latestUserMessage.content.length / 4) + 8,
      },
      requestId: "mock-request",
    };
  }
}
