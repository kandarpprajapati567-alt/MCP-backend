import assert from "node:assert/strict";
import test from "node:test";
import { readJsonBody } from "../../../src/server/http/read-json";

function jsonRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

test("reads valid bounded JSON request bodies", async () => {
  const request = jsonRequest(JSON.stringify({ task: "hello" }));
  const result = await readJsonBody(request, 100);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, { task: "hello" });
});

test("rejects request bodies exceeding the byte limit without Content-Length", async () => {
  const request = jsonRequest(JSON.stringify({ task: "x".repeat(100) }));
  assert.equal(request.headers.has("content-length"), false);
  assert.deepEqual(await readJsonBody(request, 20), { ok: false, reason: "too_large" });
});

test("rejects a declared oversized body before reading it", async () => {
  const request = jsonRequest("{}", { "content-length": "2048" });
  assert.deepEqual(await readJsonBody(request, 1024), { ok: false, reason: "too_large" });
});

test("rejects malformed JSON and invalid UTF-8", async () => {
  const malformed = jsonRequest("{");
  assert.deepEqual(await readJsonBody(malformed, 20), { ok: false, reason: "invalid_json" });

  const invalidUtf8 = new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new Uint8Array([0xff, 0xfe]),
  });
  assert.deepEqual(await readJsonBody(invalidUtf8, 20), { ok: false, reason: "invalid_json" });
});

test("rejects invalid body-size limits", async () => {
  const request = jsonRequest("{}");
  await assert.rejects(() => readJsonBody(request, 0), /positive safe JSON body size limit/);
  await assert.rejects(() => readJsonBody(request, Number.MAX_SAFE_INTEGER + 1), /positive safe JSON body size limit/);
});
