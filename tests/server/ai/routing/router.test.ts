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

import { executeWorkflow } from "../../../../src/server/ai/routing/executor";

test("executes the primary provider and passes its configured model", async () => {
  let selectedModel = "";
  const primary: AIProvider = {
    id: "primary",
    capabilities: ["text-generation"],
    async generate(request) {
      selectedModel = request.model ?? "";
      return { provider: "primary", model: selectedModel, text: "ok", finishReason: "stop", requestId: "p1" };
    },
  };
  const execution = await executeWorkflow("planner", policy, { primary }, {
    messages: [{ role: "user", content: "hello" }],
  });
  assert.equal(execution.result.text, "ok");
  assert.equal(selectedModel, "primary-model");
  assert.equal(execution.route.isFallback, false);
});

test("retries on a retryable primary failure using the configured fallback", async () => {
  let fallbackCalled = false;
  const primary: AIProvider = {
    id: "primary",
    capabilities: ["text-generation"],
    async generate() {
      throw new AIProviderError("RATE_LIMITED", "Rate limited", true);
    },
  };
  const backup: AIProvider = {
    id: "backup",
    capabilities: ["text-generation"],
    async generate(request) {
      fallbackCalled = true;
      return { provider: "backup", model: request.model ?? "unknown", text: "fallback", finishReason: "stop", requestId: "b1" };
    },
  };
  const execution = await executeWorkflow("planner", policy, { primary, backup }, {
    messages: [{ role: "user", content: "hello" }],
  });
  assert.equal(fallbackCalled, true);
  assert.equal(execution.result.text, "fallback");
  assert.equal(execution.route.providerId, "backup");
  assert.equal(execution.route.isFallback, true);
});

test("does not fallback for non-retryable authentication failures", async () => {
  let fallbackCalled = false;
  const primary: AIProvider = {
    id: "primary",
    capabilities: ["text-generation"],
    async generate() {
      throw new AIProviderError("AUTHENTICATION_FAILED", "Invalid credentials", false);
    },
  };
  const backup: AIProvider = {
    id: "backup",
    capabilities: ["text-generation"],
    async generate() {
      fallbackCalled = true;
      throw new Error("Should not be called");
    },
  };
  await assert.rejects(
    () => executeWorkflow("planner", policy, { primary, backup }, {
      messages: [{ role: "user", content: "hello" }],
    }),
    (error: unknown) => error instanceof AIProviderError && error.code === "AUTHENTICATION_FAILED",
  );
  assert.equal(fallbackCalled, false);
});


test("keeps registry keys when fallback provider ids differ", async () => {
  const primary: AIProvider = {
    id: "vendor-primary",
    capabilities: ["text-generation"],
    async generate() {
      throw new AIProviderError("RATE_LIMITED", "Rate limited", true);
    },
  };
  const backup: AIProvider = {
    id: "vendor-backup",
    capabilities: ["text-generation"],
    async generate(request) {
      return {
        provider: "vendor-backup",
        model: request.model ?? "unknown",
        text: "registry-key-fallback",
        finishReason: "stop",
        requestId: "b2",
      };
    },
  };
  const execution = await executeWorkflow("planner", policy, {
    primary: primary,
    backup: backup,
  }, {
    messages: [{ role: "user", content: "hello" }],
  });
  assert.equal(execution.result.text, "registry-key-fallback");
  assert.equal(execution.route.providerId, "backup");
});


test("reports successful provider attempts with measured latency", async () => {
  const attempts: Array<{ providerId: string; outcome: string; latencyMs: number }> = [];
  const primary: AIProvider = {
    id: "primary",
    capabilities: ["text-generation"],
    async generate(request) {
      return { provider: "primary", model: request.model ?? "unknown", text: "ok", finishReason: "stop", requestId: "obs1" };
    },
  };
  await executeWorkflow("planner", { ...policy, fallbackProviders: [] }, { primary }, {
    messages: [{ role: "user", content: "hello" }],
  }, (attempt) => attempts.push(attempt));
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].providerId, "primary");
  assert.equal(attempts[0].outcome, "success");
  assert.ok(attempts[0].latencyMs >= 0);
});

test("records retryable primary failure before successful fallback", async () => {
  const attempts: Array<{ providerId: string; outcome: string; errorCode?: string }> = [];
  const primary: AIProvider = {
    id: "primary",
    capabilities: ["text-generation"],
    async generate() { throw new AIProviderError("TIMEOUT", "Timed out", true); },
  };
  const backup: AIProvider = {
    id: "backup",
    capabilities: ["text-generation"],
    async generate(request) {
      return { provider: "backup", model: request.model ?? "unknown", text: "fallback", finishReason: "stop", requestId: "obs2" };
    },
  };
  await executeWorkflow("planner", policy, { primary, backup }, {
    messages: [{ role: "user", content: "hello" }],
  }, (attempt) => attempts.push(attempt));
  assert.deepEqual(attempts.map(({ providerId, outcome, errorCode }) => ({ providerId, outcome, errorCode })), [
    { providerId: "primary", outcome: "failure", errorCode: "TIMEOUT" },
    { providerId: "backup", outcome: "success", errorCode: undefined },
  ]);
});
