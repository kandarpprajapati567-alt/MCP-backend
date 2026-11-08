import { getMediaModel } from "./model-catalog";
import type { MediaGenerationRequest } from "./types";

export type MediaRequestParseResult =
  | { ok: true; value: MediaGenerationRequest }
  | { ok: false; status: 400 | 413; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PROMPT_LENGTH = 8_000;
const MAX_REQUEST_BYTES = 9_000;

export function parseMediaGenerationRequest(body: unknown): MediaRequestParseResult {
  if (!isRecord(body)) return { ok: false, status: 400, error: "A JSON object is required." };

  let byteLength: number;
  try {
    byteLength = Buffer.byteLength(JSON.stringify(body), "utf8");
  } catch {
    return { ok: false, status: 400, error: "Invalid request body." };
  }
  if (byteLength > MAX_REQUEST_BYTES) return { ok: false, status: 413, error: "Media request is too large." };

  const { projectId, sceneId, prompt, negativePrompt, modelId, durationSeconds, width, height, fps, seed, contentRating } = body;
  if (typeof projectId !== "string" || !UUID.test(projectId)) {
    return { ok: false, status: 400, error: "A valid projectId is required." };
  }
  if (sceneId !== undefined && (typeof sceneId !== "string" || !UUID.test(sceneId))) {
    return { ok: false, status: 400, error: "sceneId must be a valid UUID." };
  }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT_LENGTH) {
    return { ok: false, status: 400, error: "prompt must contain 1–8000 characters." };
  }
  if (negativePrompt !== undefined && (typeof negativePrompt !== "string" || negativePrompt.length > 2_000)) {
    return { ok: false, status: 400, error: "negativePrompt must be at most 2000 characters." };
  }
  if (typeof modelId !== "string") return { ok: false, status: 400, error: "A registered modelId is required." };
  const model = getMediaModel(modelId);
  if (!model || model.status !== "available" || !model.capabilities.includes("video-generation")) {
    return { ok: false, status: 400, error: "The selected video model is not currently available." };
  }
  if (typeof durationSeconds !== "number" || !Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 15) {
    return { ok: false, status: 400, error: "durationSeconds must be an integer from 1 to 15." };
  }
  if (typeof width !== "number" || !Number.isInteger(width) || width < 256 || width > 1920 ||
      typeof height !== "number" || !Number.isInteger(height) || height < 256 || height > 1920) {
    return { ok: false, status: 400, error: "width and height must be integers from 256 to 1920." };
  }
  if (typeof fps !== "number" || !Number.isInteger(fps) || fps < 8 || fps > 60) {
    return { ok: false, status: 400, error: "fps must be an integer from 8 to 60." };
  }
  if (seed !== undefined && (typeof seed !== "number" || !Number.isSafeInteger(seed) || seed < 0)) {
    return { ok: false, status: 400, error: "seed must be a non-negative safe integer." };
  }
  if (!["general", "mature", "adult"].includes(String(contentRating))) {
    return { ok: false, status: 400, error: "contentRating must be general, mature, or adult." };
  }

  return {
    ok: true,
    value: {
      projectId,
      ...(sceneId === undefined ? {} : { sceneId }),
      prompt: prompt.trim(),
      ...(negativePrompt === undefined ? {} : { negativePrompt }),
      modelId,
      durationSeconds,
      width,
      height,
      fps,
      ...(seed === undefined ? {} : { seed }),
      contentRating: contentRating as MediaGenerationRequest["contentRating"],
    },
  };
}
