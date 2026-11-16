import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FREE_OPENROUTER_MODEL,
  selectAgentExecutionRoute,
} from "../../../../src/server/ai/routing/agent-provider-policy";

const basePolicy = {
  primaryProvider: "openrouter",
  primaryModel: "openai/gpt-4o-mini",
  fallbackProviders: ["mock"],
  fallbackModel: "mock-v1",
  requiredCapabilities: ["text-generation"] as const,
};

test("Agent auto routing uses the free reasoning model when OpenRouter is connected", () => {
  assert.deepEqual(
    selectAgentExecutionRoute("auto", null, basePolicy, ["mock", "openrouter"]),
    { providerId: "openrouter", model: DEFAULT_FREE_OPENROUTER_MODEL },
  );
});

test("Agent auto routing remains deterministic Mock when OpenRouter is unavailable", () => {
  assert.deepEqual(
    selectAgentExecutionRoute("auto", null, basePolicy, ["mock"]),
    { providerId: "mock", model: "mock-v1" },
  );
});

test("Agent OpenRouter routing accepts explicit free model IDs", () => {
  assert.deepEqual(
    selectAgentExecutionRoute("openrouter", "meta-llama/llama-3.3-70b-instruct:free", basePolicy, ["mock", "openrouter"]),
    { providerId: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" },
  );
  assert.deepEqual(
    selectAgentExecutionRoute("openrouter", "openai/gpt-4o-mini", basePolicy, ["mock", "openrouter"]),
    { providerId: "mock", model: "mock-v1" },
  );
  assert.deepEqual(
    selectAgentExecutionRoute("openrouter", DEFAULT_FREE_OPENROUTER_MODEL, basePolicy, ["mock"]),
    { providerId: "mock", model: "mock-v1" },
  );
});

test("explicit paid model preferences never silently fall back to a paid provider", () => {
  assert.deepEqual(
    selectAgentExecutionRoute("auto", "openai/gpt-4o-mini", basePolicy, ["mock", "openrouter"]),
    { providerId: "mock", model: "mock-v1" },
  );
  assert.deepEqual(
    selectAgentExecutionRoute("openai", "gpt-4o-mini", basePolicy, ["mock", "openai"]),
    { providerId: "mock", model: "mock-v1" },
  );
  assert.deepEqual(
    selectAgentExecutionRoute("mock", null, basePolicy, ["mock"]),
    { providerId: "mock", model: "mock-v1" },
  );
});
