import type { WorkflowPolicies } from "./types";

/**
 * Safe bootstrap policies. The mock provider is intentionally the only
 * default until real vendor adapters and user model preferences are wired.
 */
export const DEFAULT_WORKFLOW_POLICIES: WorkflowPolicies = {
  planner: {
    primaryProvider: "mock",
    primaryModel: "mock-v1",
    fallbackProviders: [],
    requiredCapabilities: ["text-generation"],
  },
  coding: {
    primaryProvider: "mock",
    primaryModel: "mock-v1",
    fallbackProviders: [],
    requiredCapabilities: ["text-generation"],
  },
  research: {
    primaryProvider: "mock",
    primaryModel: "mock-v1",
    fallbackProviders: [],
    requiredCapabilities: ["text-generation"],
  },
  summarization: {
    primaryProvider: "mock",
    primaryModel: "mock-v1",
    fallbackProviders: [],
    requiredCapabilities: ["text-generation"],
  },
};
