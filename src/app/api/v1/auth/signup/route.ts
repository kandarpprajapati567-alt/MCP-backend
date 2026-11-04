import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateJson({ error: "Invalid JSON body." }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return privateJson({ error: "A JSON object is required." }, 400);
  }

  const { email, password } = body as Record<string, unknown>;
  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  ) {
    return privateJson(
      { error: "Provide a valid email and a password of 8–128 characters." },
      400,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: new URL("/auth/callback", request.url).toString(),
    },
  });

  if (error) {
    return privateJson({ error: error.message }, 400);
  }

  return privateJson(
    {
      user: data.user ? { id: data.user.id, email: data.user.email } : null,
      sessionCreated: Boolean(data.session),
      message: data.session
        ? "Account created and signed in."
        : "Account created. Check your email to confirm the address before signing in.",
    },
    201,
  );
}
