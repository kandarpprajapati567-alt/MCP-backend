import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AIProviderError } from "@/server/ai/providers/types";
import { parseAIGenerationInput } from "@/server/ai/routing/generation-request";
import { executeUserWorkflow } from "@/server/ai/routing/runtime-executor";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;

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
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_BODY_BYTES) {
    return privateJson({ error: "Request is too large or has an invalid content length." }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateJson({ error: "Invalid JSON body." }, 400);
  }

  const parsed = parseAIGenerationInput(body);
  if (!parsed.ok) return privateJson({ error: parsed.error }, parsed.status);

  try {
    const execution = await executeUserWorkflow(userId, parsed.value.workflow, {
      messages: parsed.value.messages,
      ...(parsed.value.temperature === undefined ? {} : { temperature: parsed.value.temperature }),
      ...(parsed.value.maxOutputTokens === undefined ? {} : { maxOutputTokens: parsed.value.maxOutputTokens }),
    });

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
