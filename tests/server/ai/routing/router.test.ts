import assert from "node:assert/strict";
import test from "node:test";

import { AIProviderError, type AIProvider } from "../../../../src/server/ai/providers/types";
import { resolveModelRoute } from "../../../../src/server/ai/routing/router";
import type { ModelRoutePolicy, ProviderRegistry } from "../../../../src/server/ai/routing/types";

function provider(id: string, capabilities: AIProvider["capabilities"]): AIProvider {
  return {
    id,
    capabilities,
    async generate() {
      throw new Error("Generation is not part of route-resolution tests.");
    },
  };
}

const policy: ModelRoutePolicy = {
  primaryProvider: "primary",
  primaryModel: "primary-model",
  fallbackProviders: ["backup"],
  fallbackModel: "backup-model",
  requiredCapabilities: ["text-generation"],
};

test("selects the primary provider when it supports required capabilities", () => {
  const providers: ProviderRegistry = {
    primary: provider("primary", ["text-generation"]),
    backup: provider("backup", ["text-generation"]),
  };

  assert.deepEqual(resolveModelRoute("planner", policy, providers), {
    workflow: "planner",
    providerId: "primary",
    model: "primary-model",
    isFallback: false,
  });
});

test("selects the first compatible fallback when the primary is unavailable", () => {
  const providers: ProviderRegistry = {
    backup: provider("backup", ["text-generation"]),
  };

  assert.deepEqual(resolveModelRoute("research", policy, providers), {
    workflow: "research",
    providerId: "backup",
    model: "backup-model",
    isFallback: true,
  });
});

test("skips providers that do not support every required capability", () => {
  const providers: ProviderRegistry = {
    primary: provider("primary", ["text-generation"]),
    backup: provider("backup", ["structured-output"]),
  };

  assert.throws(
    () => resolveModelRoute("coding", {
      ...policy,
      requiredCapabilities: ["text-generation", "structured-output"],
    }, providers),
    (error: unknown) => error instanceof AIProviderError && error.code === "PROVIDER_UNAVAILABLE",
  );
});

test("uses the primary model when no fallback model is configured", () => {
  const providers: ProviderRegistry = {
    backup: provider("backup", ["text-generation"]),
  };

  const route = resolveModelRoute("summarization", {
    ...policy,
    fallbackModel: undefined,
  }, providers);

  assert.equal(route.model, "primary-model");
  assert.equal(route.isFallback, true);
});

test("throws a normalized provider error when no provider is compatible", () => {
  assert.throws(
    () => resolveModelRoute("planner", policy, {}),
    (error: unknown) =>
      error instanceof AIProviderError &&
      error.code === "PROVIDER_UNAVAILABLE" &&
      error.retryable === false,
  );
});
