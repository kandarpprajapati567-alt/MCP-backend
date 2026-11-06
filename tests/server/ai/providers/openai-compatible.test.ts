import assert from "node:assert/strict";
import test from "node:test";

import { OpenAICompatibleProvider } from "../../../../src/server/ai/providers/openai-compatible-core";
import { AIProviderError } from "../../../../src/server/ai/providers/types";

test("sends a chat completion request to the fixed OpenAI endpoint", async () => {
  let requestedUrl = "";
  let authorization = "";
  const provider = new OpenAICompatibleProvider("openai", "test-secret-key", 5_000, async (input, init) => {
    requestedUrl = String(input);
    authorization = new Headers(init?.headers).get("Authorization") ?? "";
    return Response.json({
      id: "req_test",
      model: "gpt-test",
      choices: [{ message: { content: "Hello from test" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    });
  });

  const result = await provider.generate({
    model: "gpt-test",
    messages: [{ role: "user", content: "hello" }],
  });

  assert.equal(requestedUrl, "https://api.openai.com/v1/chat/completions");
  assert.equal(authorization, "Bearer test-secret-key");
  assert.equal(result.text, "Hello from test");
  assert.equal(result.provider, "openai");
  assert.equal(result.usage?.inputTokens, 3);
});

test("uses the fixed OpenRouter endpoint and provider headers", async () => {
  let requestedUrl = "";
  let referer = "";
  const provider = new OpenAICompatibleProvider("openrouter", "test-secret-key", 5_000, async (input, init) => {
    requestedUrl = String(input);
    referer = new Headers(init?.headers).get("HTTP-Referer") ?? "";
    return Response.json({
      model: "router-model",
      choices: [{ message: { content: [{ type: "text", text: "Routed" }] } }],
    });
  });

  const result = await provider.generate({
    model: "router-model",
    messages: [{ role: "user", content: "hello" }],
  });

  assert.equal(requestedUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(referer, "https://mcpbackend-gold.vercel.app");
  assert.equal(result.text, "Routed");
});

test("normalizes authentication failures without exposing provider response bodies", async () => {
  const provider = new OpenAICompatibleProvider("openai", "test-secret-key", 5_000, async () =>
    new Response("private provider diagnostic", { status: 401 }),
  );

  await assert.rejects(
    () => provider.generate({ model: "gpt-test", messages: [{ role: "user", content: "hello" }] }),
    (error: unknown) =>
      error instanceof AIProviderError &&
      error.code === "AUTHENTICATION_FAILED" &&
      !error.message.includes("private provider diagnostic"),
  );
});

test("marks rate limits as retryable", async () => {
  const provider = new OpenAICompatibleProvider("openai", "test-secret-key", 5_000, async () =>
    new Response("rate limited", { status: 429 }),
  );

  await assert.rejects(
    () => provider.generate({ model: "gpt-test", messages: [{ role: "user", content: "hello" }] }),
    (error: unknown) =>
      error instanceof AIProviderError &&
      error.code === "RATE_LIMITED" &&
      error.retryable,
  );
});

test("rejects malformed generation requests before network access", async () => {
  let called = false;
  const provider = new OpenAICompatibleProvider("openai", "test-secret-key", 5_000, async () => {
    called = true;
    return Response.json({});
  });

  await assert.rejects(
    () => provider.generate({ messages: [] }),
    (error: unknown) => error instanceof AIProviderError && error.code === "INVALID_REQUEST",
  );
  assert.equal(called, false);
});


test("normalizes provider timeouts as retryable failures", async () => {
  const provider = new OpenAICompatibleProvider(
    "openai",
    "test-secret-key",
    1_000,
    async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      }),
  );

  await assert.rejects(
    () => provider.generate({ model: "gpt-test", messages: [{ role: "user", content: "hello" }] }),
    (error: unknown) =>
      error instanceof AIProviderError &&
      error.code === "TIMEOUT" &&
      error.retryable,
  );
});

test("normalizes provider server errors as retryable failures", async () => {
  const provider = new OpenAICompatibleProvider("openai", "test-secret-key", 5_000, async () =>
    new Response("internal provider diagnostic", { status: 503 }),
  );

  await assert.rejects(
    () => provider.generate({ model: "gpt-test", messages: [{ role: "user", content: "hello" }] }),
    (error: unknown) =>
      error instanceof AIProviderError &&
      error.code === "PROVIDER_UNAVAILABLE" &&
      error.retryable &&
      !error.message.includes("internal provider diagnostic"),
  );
});
