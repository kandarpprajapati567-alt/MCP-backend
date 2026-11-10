import assert from "node:assert/strict";
import test from "node:test";
import { readJsonBody } from "../../../src/server/http/read-json";

test("reads valid bounded JSON request bodies", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task: "hello" }),
  });
  const result = await readJsonBody(request, 100);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, { task: "hello" });
});

test("rejects request bodies exceeding the byte limit", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    body: JSON.stringify({ task: "x".repeat(100) }),
  });
  assert.deepEqual(await readJsonBody(request, 20), { ok: false, reason: "too_large" });
});

test("rejects malformed JSON", async () => {
  const request = new Request("https://example.test/api", { method: "POST", body: "{" });
  assert.deepEqual(await readJsonBody(request, 20), { ok: false, reason: "invalid_json" });
});
