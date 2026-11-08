import assert from "node:assert/strict";
import test from "node:test";

import { getMediaModel, listAvailableMediaModels, MEDIA_MODEL_CATALOG } from "../../../src/server/media/model-catalog";

test("only server-approved available models can be selected", () => {
  assert.equal(getMediaModel("mock.video.v1")?.status, "available");
  assert.equal(getMediaModel("nvidia.cosmos-predict2")?.status, "planned");
  assert.equal(listAvailableMediaModels().some((model) => model.id.startsWith("nvidia.")), false);
});

test("planned NVIDIA models retain provider and license review metadata", () => {
  const planned = MEDIA_MODEL_CATALOG.filter((model) => model.providerId === "nvidia");
  assert.equal(planned.length >= 1, true);
  assert.equal(planned.every((model) => model.status === "planned" && model.licenseStatus === "review-required"), true);
});
