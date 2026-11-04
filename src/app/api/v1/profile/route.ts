import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  // Verify the session with Supabase Auth, not only local JWT claims.
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return { supabase, userId: null };
  return { supabase, userId: data.user.id };
}

export async function GET() {
  const { supabase, userId } = await getAuthenticatedUser();
  if (!userId) return privateJson({ error: "Unauthorized." }, 401);

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) return privateJson({ error: "Unable to load profile." }, 500);
  return privateJson({ profile: data });
}

export async function PATCH(request: Request) {
  const { supabase, userId } = await getAuthenticatedUser();
  if (!userId) return privateJson({ error: "Unauthorized." }, 401);

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
  const updates: { display_name?: string | null; avatar_url?: string | null } = {};

  if ("display_name" in input) {
    if (
      input.display_name !== null &&
      (typeof input.display_name !== "string" ||
        input.display_name.trim().length < 1 ||
        input.display_name.trim().length > 80)
    ) {
      return privateJson(
        { error: "display_name must be null or 1–80 characters." },
        400,
      );
    }
    updates.display_name =
      typeof input.display_name === "string" ? input.display_name.trim() : null;
  }

  if ("avatar_url" in input) {
    if (input.avatar_url === null || input.avatar_url === "") {
      updates.avatar_url = null;
    } else if (typeof input.avatar_url === "string" && input.avatar_url.length <= 2048) {
      try {
        const parsed = new URL(input.avatar_url);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          throw new Error("Unsupported URL protocol");
        }
        updates.avatar_url = parsed.toString();
      } catch {
        return privateJson(
          { error: "avatar_url must be a valid HTTP(S) URL." },
          400,
        );
      }
    } else {
      return privateJson(
        { error: "avatar_url must be null or a URL up to 2048 characters." },
        400,
      );
    }
  }

  if (Object.keys(updates).length === 0) {
    return privateJson({ error: "No supported profile fields supplied." }, 400);
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: userId, ...updates }, { onConflict: "id" })
    .select("id, display_name, avatar_url, created_at, updated_at")
    .single();

  if (error) return privateJson({ error: "Unable to update profile." }, 500);
  return privateJson({ profile: data });
}
