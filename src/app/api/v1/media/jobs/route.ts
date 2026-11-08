import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseMediaGenerationRequest } from "@/server/media/generation-request";
import { getMediaModel } from "@/server/media/model-catalog";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 16_000;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const admin = createAdminClient();
  let query = admin.from("media_generation_jobs")
    .select("id,project_id,scene_id,job_type,model_id,provider_id,prompt,content_rating,status,attempt_count,result_assets,error_code,created_at,updated_at,completed_at")
    .eq("owner_id", PERSONAL_OWNER_ID)
    .order("created_at", { ascending: false }).limit(50);
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) return json({ error: "Unable to load media jobs." }, 500);
  return json({ jobs: data ?? [] });
}

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length < 0 || length > MAX_BODY_BYTES) return json({ error: "Request body too large." }, 413);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const parsed = parseMediaGenerationRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
  const input = parsed.value;
  const model = getMediaModel(input.modelId);
  if (!model) return json({ error: "Model not found." }, 400);

  const admin = createAdminClient();
  const { data: project } = await admin.from("media_projects").select("id")
    .eq("id", input.projectId).eq("owner_id", PERSONAL_OWNER_ID).maybeSingle();
  if (!project) return json({ error: "Media project not found." }, 404);

  if (input.sceneId) {
    const { data: scene } = await admin.from("media_scenes").select("id")
      .eq("id", input.sceneId).eq("project_id", input.projectId)
      .eq("owner_id", PERSONAL_OWNER_ID).maybeSingle();
    if (!scene) return json({ error: "Scene does not belong to this project." }, 404);
  }

  const { data: job, error } = await admin.from("media_generation_jobs").insert({
    owner_id: PERSONAL_OWNER_ID,
    project_id: input.projectId,
    scene_id: input.sceneId ?? null,
    job_type: "video-generation",
    model_id: model.id,
    provider_id: model.providerId,
    prompt: input.prompt,
    negative_prompt: input.negativePrompt ?? null,
    parameters: {
      durationSeconds: input.durationSeconds,
      width: input.width,
      height: input.height,
      fps: input.fps,
      ...(input.seed === undefined ? {} : { seed: input.seed }),
    },
    content_rating: input.contentRating,
    status: "queued",
  }).select("id,project_id,scene_id,job_type,model_id,provider_id,status,created_at").single();

  if (error || !job) return json({ error: "Unable to queue media generation job." }, 500);
  await admin.from("media_generation_events").insert({
    owner_id: PERSONAL_OWNER_ID,
    job_id: job.id,
    event_type: "job.created",
    payload: { modelId: model.id, runtime: model.runtime, durationSeconds: input.durationSeconds },
  });
  return json({ job, message: "Job queued. A generation worker is not connected yet; no video has been rendered." }, 202);
}
