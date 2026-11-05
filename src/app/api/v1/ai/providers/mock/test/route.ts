import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MockAIProvider } from "@/server/ai/providers/mock-provider";
import { AIProviderError } from "@/server/ai/providers/types";

export const dynamic = "force-dynamic";

const provider = new MockAIProvider();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in is required." } },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16_000) {
    return NextResponse.json(
      { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." } },
      { status: 413, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "A valid JSON body is required." } },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const prompt =
    typeof body === "object" && body !== null && "prompt" in body
      ? (body as { prompt?: unknown }).prompt
      : undefined;

  if (typeof prompt !== "string" || prompt.trim().length === 0 || prompt.length > 1_000) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "prompt must be 1–1000 characters." } },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const result = await provider.generate({
      messages: [{ role: "user", content: prompt.trim() }],
    });

    return NextResponse.json(
      { success: true, provider: provider.id, result },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (cause) {
    if (cause instanceof AIProviderError) {
      return NextResponse.json(
        { error: { code: cause.code, message: cause.message } },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    return NextResponse.json(
      { error: { code: "PROVIDER_UNAVAILABLE", message: "AI provider test failed." } },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
