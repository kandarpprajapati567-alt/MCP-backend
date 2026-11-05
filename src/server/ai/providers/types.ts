export type AIProviderCapability = "text-generation" | "structured-output";

export type AIMessageRole = "system" | "user" | "assistant";

export interface AIMessage {
  role: AIMessageRole;
  content: string;
}

export interface AIGenerationRequest {
  messages: AIMessage[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AIGenerationResult {
  provider: string;
  model: string;
  text: string;
  finishReason: "stop" | "length";
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  requestId: string;
}

export interface AIProvider {
  readonly id: string;
  readonly capabilities: readonly AIProviderCapability[];
  generate(request: AIGenerationRequest): Promise<AIGenerationResult>;
}

export type AIProviderErrorCode =
  | "INVALID_REQUEST"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "AUTHENTICATION_FAILED"
  | "PROVIDER_UNAVAILABLE"
  | "UNKNOWN";

export class AIProviderError extends Error {
  constructor(
    public readonly code: AIProviderErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
