import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createMockAIProvider } from "@/server/ai/providers/mock";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Authenticated smoke test for the provider adapter contract.
 * This endpoint deliberately uses the mock provider: it does not contact
 * vendors, read stored credentials, or consume provider credits.
 */
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return privateJson({ error: "Unauthorized." }, 401);
  }

  try {
    const provider = createMockAIProvider();
    const result = await provider.generate({
      messages: [{ role: "user", content: "provider health check" }],
      maxOutputTokens: 32,
    });

    return privateJson({
      ok: result.provider === provider.id && result.text.length > 0,
      provider: provider.id,
      model: result.model,
      capabilities: provider.capabilities,
      requestId: result.requestId,
    });
  } catch {
    return privateJson({ error: "Provider adapter health check failed." }, 503);
  }
}
