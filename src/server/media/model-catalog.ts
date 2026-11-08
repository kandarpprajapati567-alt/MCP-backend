import type { MediaModelDefinition } from "./types";

/**
 * Server-owned model catalog. Clients may select only entries marked available.
 * Planned entries are visible for roadmap purposes but cannot receive jobs.
 * Model licenses and deployment requirements must be reviewed before activation.
 */
export const MEDIA_MODEL_CATALOG: readonly MediaModelDefinition[] = [
  {
    id: "mock.video.v1",
    displayName: "Development Video Mock",
    providerId: "mock",
    runtime: "mock",
    capabilities: ["video-generation", "image-to-video"],
    status: "available",
    licenseStatus: "not-applicable",
    description: "Deterministic development adapter; does not generate real video.",
  },
  {
    id: "nvidia.cosmos-predict2",
    displayName: "NVIDIA Cosmos Predict2",
    providerId: "nvidia",
    runtime: "gpu-worker",
    capabilities: ["video-generation", "image-to-video"],
    status: "planned",
    licenseStatus: "review-required",
    description: "Planned video/world-model adapter; enable only after model, license, and GPU requirements are verified.",
  },
  {
    id: "nvidia.nemotron",
    displayName: "NVIDIA Nemotron",
    providerId: "nvidia",
    runtime: "nvidia-nim",
    capabilities: ["script-planning"],
    status: "planned",
    licenseStatus: "review-required",
    description: "Planned script and scene-planning model adapter; not a video renderer.",
  },
];

export function getMediaModel(modelId: string): MediaModelDefinition | undefined {
  return MEDIA_MODEL_CATALOG.find((model) => model.id === modelId);
}

export function listAvailableMediaModels(): MediaModelDefinition[] {
  return MEDIA_MODEL_CATALOG.filter((model) => model.status === "available");
}
