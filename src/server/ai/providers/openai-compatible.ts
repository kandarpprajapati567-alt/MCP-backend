import "server-only";

import { randomUUID } from "node:crypto";
import {
  AIProviderError,
  type AIGenerationRequest,
  type AIGenerationResult,
  type AIProvider,
} from "./types";

const PROVIDER_ENDPOINTS = {
  openai: "https://api.openai.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
} as const;

type CompatibleProviderId = keyof typeof PROVIDER_ENDPOINTS;

interface ChatCompletionPayload {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: { content?: string | Array<{ type?: string; text?: string }> | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(content: ChatCompletionPayload["choices"] extends Array<infer C>
  ? C extends { message?: infer M } ? M extends { content?: infer T } ? T : never : never
  : never): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
  }
  return "";
}

/**
 * OpenAI Chat Completions-compatible adapter.
 * Provider URLs are fixed in this module; callers cannot supply arbitrary hosts.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly capabilities = ["text-generation"] as const;
  private readonly endpoint: string;

  constructor(
    readonly id: CompatibleProviderId,
    private readonly apiKey: string,
    private readonly timeoutMs = 30_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.endpoint = PROVIDER_ENDPOINTS[id];
    if (!apiKey || apiKey.trim() !== apiKey || apiKey.length > 4096) {
      throw new AIProviderError("INVALID_REQUEST", "Provider credential is invalid.");
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
      throw new AIProviderError("INVALID_REQUEST", "Provider timeout is invalid.");
    }
  }

  async generate(request: AIGenerationRequest): Promise<AIGenerationResult> {
    if (
      !request ||
      !Array.isArray(request.messages) ||
      request.messages.length < 1 ||
      request.messages.length > 20 ||
      request.messages.some((message) =>
        !message ||
        !["system", "user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" ||
        message.content.length > 4_000
      )
    ) {
      throw new AIProviderError("INVALID_REQUEST", "A valid messages array is required.");
    }

    const totalLength = request.messages.reduce((sum, message) => sum + message.content.length, 0);
    if (totalLength > 12_000) {
      throw new AIProviderError("INVALID_REQUEST", "Request content is too large.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(this.id === "openrouter"
            ? { "HTTP-Referer": "https://mcpbackend-gold.vercel.app", "X-Title": "Futuristic System" }
            : {}),
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          ...(request.maxOutputTokens === undefined
            ? {}
            : { max_tokens: request.maxOutputTokens }),
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new AIProviderError(
            "AUTHENTICATION_FAILED",
            "The configured provider credential was rejected.",
            false,
          );
        }
        if (response.status === 429) {
          throw new AIProviderError("RATE_LIMITED", "The provider rate limit was reached.", true);
        }
        if (response.status >= 500) {
          throw new AIProviderError("PROVIDER_UNAVAILABLE", "The provider is temporarily unavailable.", true);
        }
        throw new AIProviderError("INVALID_REQUEST", "The provider rejected the generation request.");
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AIProviderError("UNKNOWN", "The provider returned an invalid response.");
      }
      if (!isRecord(payload) || !Array.isArray(payload.choices)) {
        throw new AIProviderError("UNKNOWN", "The provider returned an unsupported response.");
      }

      const data = payload as ChatCompletionPayload;
      const choice = data.choices[0];
      if (!choice?.message) {
        throw new AIProviderError("UNKNOWN", "The provider response did not contain a message.");
      }

      const text = readText(choice.message.content);
      if (!text) {
        throw new AIProviderError("UNKNOWN", "The provider returned an empty response.");
      }

      return {
        provider: this.id,
        model: typeof data.model === "string" ? data.model : request.model ?? "unknown",
        text,
        finishReason: choice.finish_reason === "length" ? "length" : "stop",
        usage: {
          ...(typeof data.usage?.prompt_tokens === "number"
            ? { inputTokens: data.usage.prompt_tokens }
            : {}),
          ...(typeof data.usage?.completion_tokens === "number"
            ? { outputTokens: data.usage.completion_tokens }
            : {}),
        },
        requestId: typeof data.id === "string" ? data.id : randomUUID(),
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (controller.signal.aborted) {
        throw new AIProviderError("TIMEOUT", "The provider request timed out.", true);
      }
      throw new AIProviderError("PROVIDER_UNAVAILABLE", "Unable to reach the configured provider.", true);
    } finally {
      clearTimeout(timeout);
    }
  }
}
