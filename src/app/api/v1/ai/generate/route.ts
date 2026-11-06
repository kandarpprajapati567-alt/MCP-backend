import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AIProviderError } from "@/server/ai/providers/types";
import { executeUserWorkflow } from "@/server/ai/routing/runtime-executor";
import type { AIWorkflow } from "@/server/ai/routing/types";

export const dynamic = "force-dynamic";

const WORKFLOWS = ["planner", "coding", "research", "summarization"] as const;
const MAX_BODY_BYTES = 16_384;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_TOTAL_LENGTH = 12_000;

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  let userId: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return privateJson({ error: "Unauthorized." }, 401);
    userId = data.user.id;
  } catch {
    return privateJson({ error: "Authentication is unavailable." }, 503);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return privateJson({ error: "Request is too large." }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateJson({ error: "Invalid JSON body." }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return privateJson({ error: "A JSON object is required." }, 400);
  }

  const input = body as Record<string, unknown>;
  if (
    typeof input.workflow !== "string" ||
    !WORKFLOWS.includes(input.workflow as (typeof WORKFLOWS)[number])
  ) {
    return privateJson({ error: "A supported workflow is required." }, 400);
  }

  if (
    !Array.isArray(input.messages) ||
    input.messages.length < 1 ||
    input.messages.length > MAX_MESSAGES
  ) {
    return privateJson({ error: "A valid messages array is required." }, 400);
  }

  let totalLength = 0;
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  for (const item of input.messages) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return privateJson({ error: "Each message must be an object." }, 400);
    }
    const message = item as Record<string, unknown>;
    if (
      !["system", "user", "assistant"].includes(String(message.role)) ||
      typeof message.content !== "string" ||
      message.content.length > MAX_MESSAGE_LENGTH
    ) {
      return privateJson({ error: "A message has an invalid role or content." }, 400);
    }
    totalLength += message.content.length;
    messages.push({
      role: message.role as "system" | "user" | "assistant",
      content: message.content,
    });
  }

  if (totalLength > MAX_TOTAL_LENGTH) {
    return privateJson({ error: "Request content is too large." }, 413);
  }

  const temperature = input.temperature;
  if (
    temperature !== undefined &&
    (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 2)
  ) {
    return privateJson({ error: "Temperature must be between 0 and 2." }, 400);
  }

  const maxOutputTokens = input.maxOutputTokens;
  if (
    maxOutputTokens !== undefined &&
    (!Number.isInteger(maxOutputTokens) || (maxOutputTokens as number) < 1 || (maxOutputTokens as number) > 2_000)
  ) {
    return privateJson({ error: "maxOutputTokens must be an integer from 1 to 2000." }, 400);
  }

  try {
    const execution = await executeUserWorkflow(
      userId,
      input.workflow as AIWorkflow,
      {
        messages,
        ...(temperature === undefined ? {} : { temperature }),
        ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
      },
    );

    return privateJson({
      workflow: execution.route.workflow,
      provider: execution.result.provider,
      model: execution.result.model,
      usedFallback: execution.route.isFallback,
      output: execution.result.text,
      finishReason: execution.result.finishReason,
      usage: execution.result.usage ?? null,
      requestId: execution.result.requestId,
    });
  } catch (error) {
    if (error instanceof AIProviderError) {
      const status =
        error.code === "INVALID_REQUEST" ? 400 :
        error.code === "AUTHENTICATION_FAILED" ? 502 :
        error.code === "RATE_LIMITED" ? 429 :
        error.code === "TIMEOUT" ? 504 : 503;
      return privateJson({ error: "AI generation could not be completed.", code: error.code }, status);
    }
    console.error("[ai-generate] Execution failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return privateJson({ error: "AI generation is temporarily unavailable." }, 503);
  }
}
