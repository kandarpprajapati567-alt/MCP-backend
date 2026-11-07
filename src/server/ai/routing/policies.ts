import type { WorkflowPolicies } from "./types";

const mockPolicy = {
  primaryProvider: "mock",
  primaryModel: "mock-v1",
  fallbackProviders: [],
  requiredCapabilities: ["text-generation"] as const,
};

export const DEFAULT_WORKFLOW_POLICIES: WorkflowPolicies = {
  planner: mockPolicy,
  coding: mockPolicy,
  research: mockPolicy,
  summarization: mockPolicy,
  chat: mockPolicy,
  notes: mockPolicy,
};
