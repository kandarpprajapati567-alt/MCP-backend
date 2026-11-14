import assert from "node:assert/strict";
import test from "node:test";
import { selectAgentExecutionRoute } from "../../../../src/server/ai/routing/agent-provider-policy";

const basePolicy = {
  primaryProvider: "openrouter",
  primaryModel: "openai/gpt-4o-mini",
  fallbackProviders: ["mock"],
  fallbackModel: "mock-v1",
  requiredCapabilities: ["text-generation"] as const,
};

test("Agent auto routing never selects a default paid OpenRouter model", () => {
  assert.deepEqual(
    selectAgentExecutionRoute("auto", null, basePolicy, ["mock", "openrouter"]),
    { providerId: "mock", model: "mock-v1" },
  );
});

test("Agent OpenRouter routing requires an explicit free model and available credential", () => {
  assert.deepEqual(
    selectAgentExecutionRoute("openrouter", "meta-llama/llama-3.3-70b-instruct:free", basePolicy, ["mock", "openrouter"]),
    { providerId: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" },
  );
  assert.deepEqual(
    selectAgentExecutionRoute("openrouter", "openai/gpt-4o-mini", basePolicy, ["mock", "openrouter"]),
    { providerId: "mock", model: "mock-v1" },
  );
  assert.deepEqual(
    selectAgentExecutionRoute("openrouter", "meta-llama/llama-3.3-70b-instruct:free", basePolicy, ["mock"]),
    { providerId: "mock", model: "mock-v1" },
  );
});

test("Agent OpenAI and mock preferences remain zero-cost", () => {
  assert.deepEqual(
    selectAgentExecutionRoute("openai", "gpt-4o-mini", basePolicy, ["mock", "openai"]),
    { providerId: "mock", model: "mock-v1" },
  );
  assert.deepEqual(
    selectAgentExecutionRoute("mock", null, basePolicy, ["mock"]),
    { providerId: "mock", model: "mock-v1" },
  );
});
