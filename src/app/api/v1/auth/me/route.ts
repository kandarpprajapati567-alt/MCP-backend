import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  // Verify the session with Supabase Auth, not only local JWT claims.
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json({ user: null }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  return NextResponse.json(
    {
      user: {
        id: data.user.id,
        email: data.user.email ?? null,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
