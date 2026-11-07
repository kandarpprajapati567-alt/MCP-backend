import type { AIProviderCapability } from "../providers/types";

export type AIWorkflow = "planner" | "coding" | "research" | "summarization" | "chat" | "notes";

export interface ModelRoutePolicy {
  primaryProvider: string;
  primaryModel: string;
  fallbackProviders: readonly string[];
  fallbackModel?: string;
  requiredCapabilities: readonly AIProviderCapability[];
}

export type WorkflowPolicies = Readonly<Record<AIWorkflow, ModelRoutePolicy>>;

export interface ModelRoute {
  workflow: AIWorkflow;
  providerId: string;
  model: string;
  isFallback: boolean;
}

export type ProviderRegistry = Readonly<Record<string, import("../providers/types").AIProvider>>;
