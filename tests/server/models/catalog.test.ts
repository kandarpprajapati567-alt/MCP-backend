import assert from "node:assert/strict";
import test from "node:test";
import { getProviderAdapter, listProviderAdapters } from "../../../src/server/models/catalog";
import { TOOL_CATALOG } from "../../../src/server/tools/registry";

test("catalog contains general cloud, local and media provider families", () => {
  const ids = listProviderAdapters().map((provider) => provider.id);
  for (const id of ["openai-compatible", "nvidia-nim", "google-genai", "anthropic", "ollama", "vllm", "huggingface-tgi", "comfyui"]) {
    assert.equal(ids.includes(id), true, "missing provider " + id);
  }
});

test("provider discovery never exposes credential or endpoint environment variable names", () => {
  const providers = listProviderAdapters() as unknown as Array<Record<string, unknown>>;
  for (const provider of providers) {
    assert.equal("apiKeyEnv" in provider, false);
    assert.equal("endpointEnv" in provider, false);
    assert.equal("apiKey" in provider, false);
    assert.equal("endpoint" in provider, false);
  }
});

test("provider metadata declares media and language capabilities", () => {
  assert.equal(getProviderAdapter("nvidia-nim")?.supportedCapabilities.includes("video-generation"), true);
  assert.equal(getProviderAdapter("comfyui")?.supportedCapabilities.includes("image-generation"), true);
  assert.equal(getProviderAdapter("ollama")?.supportedCapabilities.includes("chat"), true);
});

test("MCP tools expose safe provider discovery", () => {
  assert.equal(TOOL_CATALOG.some((tool) => tool.id === "models.list_providers"), true);
  assert.equal(TOOL_CATALOG.some((tool) => tool.id === "models.provider_info"), true);
});
