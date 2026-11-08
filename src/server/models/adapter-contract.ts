import type { ModelCapability, ModelModality, ProviderProtocol } from "./catalog";
export interface ModelManifest {
  id: string; providerId: string; providerModelId: string; displayName: string;
  modalities: readonly ModelModality[]; capabilities: readonly ModelCapability[];
  contextWindow?: number; maxOutputTokens?: number;
  license: "open-weights" | "commercial-api" | "proprietary" | "unknown";
  enabled: boolean;
}
export interface ModelTaskRequest {
  modelId: string; task: ModelCapability; input: Record<string, unknown>;
  options?: Record<string, unknown>;
}
export interface ModelTaskResult {
  taskId: string; providerId: string; modelId: string;
  status: "queued" | "running" | "completed" | "failed";
  output?: Record<string, unknown>; errorCode?: string;
}
/** Binary media uses private object-storage references; long jobs are worker-queued. */
export interface ModelProviderAdapter {
  readonly id: string; readonly protocol: ProviderProtocol;
  supports(task: ModelCapability): boolean;
  submit(request: ModelTaskRequest): Promise<ModelTaskResult>;
}
