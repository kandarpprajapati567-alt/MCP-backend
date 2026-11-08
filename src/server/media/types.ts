export type MediaJobType = "image-generation" | "video-generation" | "audio-generation" | "lip-sync" | "upscale";
export type MediaGenre = "drama" | "romance" | "action" | "horror" | "thriller" | "science-fiction" | "fantasy" | "other";
export type MediaModelStatus = "available" | "planned" | "disabled";
export type MediaCapability =
  | "script-planning" | "image-generation" | "video-generation" | "image-to-video"
  | "audio-generation" | "lip-sync" | "upscale";

export interface MediaModelDefinition {
  id: string;
  displayName: string;
  providerId: string;
  runtime: "mock" | "nvidia-nim" | "gpu-worker";
  capabilities: readonly MediaCapability[];
  status: MediaModelStatus;
  licenseStatus: "verified" | "review-required" | "not-applicable";
  description: string;
}

export interface MediaGenerationRequest {
  projectId: string;
  sceneId?: string;
  prompt: string;
  negativePrompt?: string;
  modelId: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  seed?: number;
  contentRating: "general" | "mature" | "adult";
}
