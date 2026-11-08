import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";

export const dynamic = "force-dynamic";
const GENRES = ["drama", "romance", "action", "horror", "thriller", "science-fiction", "fantasy", "other"] as const;
const FORMATS = ["episodic", "short-film", "feature-film"] as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const admin = createAdminClient();
  const { data, error } = await admin.from("media_projects")
    .select("id,title,logline,genre,format,target_episode_seconds,status,created_at,updated_at")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .order("updated_at", { ascending: false }).limit(50);
  if (error) return json({ error: "Unable to load media projects." }, 500);
  return json({ projects: data ?? [] });
}

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length < 0 || length > 8_000) return json({ error: "Request body too large." }, 413);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "A JSON object is required." }, 400);
  const input = body as Record<string, unknown>;
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 160) {
    return json({ error: "title must contain 1–160 characters." }, 400);
  }
  if (input.logline !== undefined && (typeof input.logline !== "string" || input.logline.length > 2000)) {
    return json({ error: "logline must be at most 2000 characters." }, 400);
  }
  const genre = input.genre ?? "other";
  const format = input.format ?? "episodic";
  const targetSeconds = input.targetEpisodeSeconds ?? 600;
  if (!GENRES.includes(genre as typeof GENRES[number])) return json({ error: "Unsupported genre." }, 400);
  if (!FORMATS.includes(format as typeof FORMATS[number])) return json({ error: "Unsupported project format." }, 400);
  if (typeof targetSeconds !== "number" || !Number.isInteger(targetSeconds) || targetSeconds < 30 || targetSeconds > 3600) {
    return json({ error: "targetEpisodeSeconds must be an integer from 30 to 3600." }, 400);
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("media_projects").insert({
    owner_id: PERSONAL_OWNER_ID,
    title: input.title.trim(),
    logline: typeof input.logline === "string" ? input.logline.trim() : "",
    genre,
    format,
    target_episode_seconds: targetSeconds,
  }).select("id,title,logline,genre,format,target_episode_seconds,status,created_at").single();
  if (error || !data) return json({ error: "Unable to create media project." }, 500);
  return json({ project: data }, 201);
}
