import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptProviderSecret } from "@/server/ai/secrets/encryption";

export const dynamic = "force-dynamic";

const PROVIDERS = ["openai", "anthropic", "google", "openrouter"] as const;
type Provider = (typeof PROVIDERS)[number];

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function authenticatedUserId() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? null : data.user.id;
}

export async function GET() {
  const userId = await authenticatedUserId();
  if (!userId) return privateJson({ error: "Unauthorized." }, 401);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ai_provider_secrets")
      .select("provider, created_at, updated_at")
      .eq("user_id", userId)
      .order("provider");

    if (error) return privateJson({ error: "Unable to load provider settings." }, 500);
    return privateJson({ providers: data ?? [] });
  } catch {
    return privateJson({ error: "Provider secret storage is not configured." }, 503);
  }
}

export async function PUT(request: Request) {
  const userId = await authenticatedUserId();
  if (!userId) return privateJson({ error: "Unauthorized." }, 401);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 8_192) return privateJson({ error: "Request is too large." }, 413);

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
    typeof input.provider !== "string" ||
    !PROVIDERS.includes(input.provider as Provider) ||
    typeof input.apiKey !== "string" ||
    input.apiKey.trim() !== input.apiKey ||
    input.apiKey.length < 8 ||
    input.apiKey.length > 4096
  ) {
    return privateJson({ error: "A supported provider and valid API key are required." }, 400);
  }

  try {
    const encrypted = encryptProviderSecret(input.apiKey);
    const admin = createAdminClient();
    const { error } = await admin.from("ai_provider_secrets").upsert(
      {
        user_id: userId,
        provider: input.provider,
        ...encrypted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );

    if (error) return privateJson({ error: "Unable to save provider credential." }, 500);
    return privateJson({ saved: true, provider: input.provider });
  } catch {
    return privateJson({ error: "Provider secret storage is not configured or unavailable." }, 503);
  }
}

export async function DELETE(request: Request) {
  const userId = await authenticatedUserId();
  if (!userId) return privateJson({ error: "Unauthorized." }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateJson({ error: "Invalid JSON body." }, 400);
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof (body as Record<string, unknown>).provider !== "string" ||
    !PROVIDERS.includes((body as Record<string, unknown>).provider as Provider)
  ) {
    return privateJson({ error: "A supported provider is required." }, 400);
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("ai_provider_secrets")
      .delete()
      .eq("user_id", userId)
      .eq("provider", (body as Record<string, unknown>).provider as Provider);

    if (error) return privateJson({ error: "Unable to remove provider credential." }, 500);
    return privateJson({ deleted: true });
  } catch {
    return privateJson({ error: "Provider secret storage is not configured or unavailable." }, 503);
  }
}
