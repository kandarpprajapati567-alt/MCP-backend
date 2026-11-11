import assert from "node:assert/strict";
import test from "node:test";
import { searchWeb } from "../../../src/server/tools/web-search";
import { TOOL_CATALOG } from "../../../src/server/tools/registry";

const originalFetch = globalThis.fetch;

test.after(() => { globalThis.fetch = originalFetch; });

test("registers web.search as a read-only MCP-compatible tool", () => {
  const tool = TOOL_CATALOG.find((item) => item.id === "web.search");
  assert.ok(tool);
  assert.equal(tool.permission, "web.search");
  assert.equal(tool.sideEffect, false);
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.openWorldHint, true);
});

test("searches Tavily and returns bounded source references without exposing credentials", async () => {
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      answer: "A short sourced answer.",
      results: [
        { title: "Example source", url: "https://example.com/page", content: "Relevant excerpt", score: 0.92, published_date: "2026-11-10" },
        { title: "Invalid URL", url: "javascript:alert(1)", content: "Ignore" },
      ],
    }), { status: 200 });
  }) as typeof fetch;

  const result = await searchWeb({ query: "latest AI agent protocols", maxResults: 3 }, "tavily-test-key");
  assert.equal(requestBody.api_key, "tavily-test-key");
  assert.equal(result.count, 1);
  assert.equal(result.results[0].url, "https://example.com/page");
  assert.equal(result.answer, "A short sourced answer.");
  assert.equal(JSON.stringify(result).includes("tavily-test-key"), false);
});

test("rejects unexpected arguments and invalid result limits before network access", async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return new Response("{}", { status: 200 }); }) as typeof fetch;
  await assert.rejects(() => searchWeb({ query: "ok", apiKey: "leak" }, "secret-key"), /only query and maxResults/);
  await assert.rejects(() => searchWeb({ query: "x", maxResults: 9 }, "secret-key"), /2–500 characters/);
  assert.equal(calls, 0);
});
