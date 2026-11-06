import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAIUsageStatus } from "@/server/ai/usage/usage-status-service";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET() {
  let userId: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return privateJson({ error: "Unauthorized." }, 401);
    userId = data.user.id;
  } catch {
    return privateJson({ error: "Authentication is unavailable." }, 503);
  }

  try {
    return privateJson({ ok: true, usage: await getAIUsageStatus(userId) });
  } catch {
    return privateJson({ error: "AI usage status is temporarily unavailable." }, 503);
  }
}
