import assert from "node:assert/strict";
import test from "node:test";

import { parseMediaGenerationRequest } from "../../../src/server/media/generation-request";
import { listAvailableMediaModels } from "../../../src/server/media/model-catalog";

const valid = {
  projectId: "a3b6a83a-8e8f-4dcb-8c11-8df6f7e1d901",
  prompt: "A cinematic wide shot of a fictional city at night.",
  modelId: "mock.video.v1",
  durationSeconds: 15,
  width: 1280,
  height: 720,
  fps: 24,
  contentRating: "general",
};

test("accepts a valid bounded 15-second development generation request", () => {
  const result = parseMediaGenerationRequest(valid);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.durationSeconds, 15);
    assert.equal(result.value.modelId, "mock.video.v1");
  }
});

test("exposes only currently available models as runnable", () => {
  assert.deepEqual(listAvailableMediaModels().map((model) => model.id), ["mock.video.v1"]);
  assert.equal(parseMediaGenerationRequest({ ...valid, modelId: "nvidia.cosmos-predict2" }).ok, false);
});

test("rejects malformed IDs, prompts, and unsupported model IDs", () => {
  assert.equal(parseMediaGenerationRequest(null).ok, false);
  assert.equal(parseMediaGenerationRequest({ ...valid, projectId: "not-a-uuid" }).ok, false);
  assert.equal(parseMediaGenerationRequest({ ...valid, prompt: " " }).ok, false);
  assert.equal(parseMediaGenerationRequest({ ...valid, modelId: "https://untrusted.example/model" }).ok, false);
});

test("enforces a maximum duration of 15 seconds and bounded render settings", () => {
  for (const durationSeconds of [0, 16, 1.5, "15"]) {
    assert.equal(parseMediaGenerationRequest({ ...valid, durationSeconds }).ok, false);
  }
  assert.equal(parseMediaGenerationRequest({ ...valid, width: 8192 }).ok, false);
  assert.equal(parseMediaGenerationRequest({ ...valid, fps: 120 }).ok, false);
});

test("rejects invalid optional fields and oversized prompts", () => {
  assert.equal(parseMediaGenerationRequest({ ...valid, sceneId: "bad" }).ok, false);
  assert.equal(parseMediaGenerationRequest({ ...valid, seed: -1 }).ok, false);
  assert.equal(parseMediaGenerationRequest({ ...valid, negativePrompt: "x".repeat(2001) }).ok, false);
  assert.equal(parseMediaGenerationRequest({ ...valid, prompt: "x".repeat(8001) }).ok, false);
  const oversized = { ...valid, prompt: "x".repeat(8000), negativePrompt: "y".repeat(2000) };
  const result = parseMediaGenerationRequest(oversized);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 413);
});
