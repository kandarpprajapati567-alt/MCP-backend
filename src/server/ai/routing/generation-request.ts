import type { AIWorkflow } from "@/server/ai/routing/types";

export interface AIGenerationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIGenerationInput {
  workflow: AIWorkflow;
  messages: AIGenerationMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

export type AIGenerationParseResult =
  | { ok: true; value: AIGenerationInput }
  | { ok: false; status: 400 | 413; error: string };

const WORKFLOWS = ["planner", "coding", "research", "summarization"] as const;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_TOTAL_LENGTH = 12_000;

export function parseAIGenerationInput(body: unknown): AIGenerationParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "A JSON object is required." };
  }

  const input = body as Record<string, unknown>;
  if (
    typeof input.workflow !== "string" ||
    !WORKFLOWS.includes(input.workflow as (typeof WORKFLOWS)[number])
  ) {
    return { ok: false, status: 400, error: "A supported workflow is required." };
  }

  if (!Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > MAX_MESSAGES) {
    return { ok: false, status: 400, error: "A valid messages array is required." };
  }

  let totalLength = 0;
  const messages: AIGenerationMessage[] = [];
  for (const item of input.messages) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, status: 400, error: "Each message must be an object." };
    }
    const message = item as Record<string, unknown>;
    if (
      !["system", "user", "assistant"].includes(String(message.role)) ||
      typeof message.content !== "string" ||
      message.content.length > MAX_MESSAGE_LENGTH
    ) {
      return { ok: false, status: 400, error: "A message has an invalid role or content." };
    }
    totalLength += message.content.length;
    messages.push({
      role: message.role as AIGenerationMessage["role"],
      content: message.content,
    });
  }

  if (totalLength > MAX_TOTAL_LENGTH) {
    return { ok: false, status: 413, error: "Request content is too large." };
  }

  const temperature = input.temperature;
  if (
    temperature !== undefined &&
    (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 2)
  ) {
    return { ok: false, status: 400, error: "Temperature must be between 0 and 2." };
  }

  const maxOutputTokens = input.maxOutputTokens;
  if (
    maxOutputTokens !== undefined &&
    (typeof maxOutputTokens !== "number" ||
      !Number.isInteger(maxOutputTokens) ||
      maxOutputTokens < 1 ||
      maxOutputTokens > 2_000)
  ) {
    return { ok: false, status: 400, error: "maxOutputTokens must be an integer from 1 to 2000." };
  }

  return {
    ok: true,
    value: {
      workflow: input.workflow as AIWorkflow,
      messages,
      ...(temperature === undefined ? {} : { temperature }),
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    },
  };
}
