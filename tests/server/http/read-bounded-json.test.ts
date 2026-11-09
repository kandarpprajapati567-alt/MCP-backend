import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedJson } from "../../../src/server/http/read-bounded-json";

function jsonRequest(body: string, extraHeaders: Record<string, string> = {}) {
  return new Request("https://example.test/api/v1/agent/tasks", {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body,
  });
}

test("reads a valid bounded JSON request", async () => {
  const request = jsonRequest(JSON.stringify({ task: "check device status" }));
  const parsed = await readBoundedJson(request, 1024);
  assert.deepEqual(parsed, { ok: true, value: { task: "check device status" } });
});

test("rejects oversized streamed bodies even when Content-Length is absent", async () => {
  const request = jsonRequest(JSON.stringify({ task: "x".repeat(2048) }));
  assert.equal(request.headers.has("content-length"), false);

  const parsed = await readBoundedJson(request, 1024);
  assert.deepEqual(parsed, {
    ok: false,
    status: 413,
    error: "Request body too large.",
  });
});

test("rejects a declared oversized body before reading it", async () => {
  const request = jsonRequest("{}", { "content-length": "2048" });
  const parsed = await readBoundedJson(request, 1024);
  assert.deepEqual(parsed, {
    ok: false,
    status: 413,
    error: "Request body too large.",
  });
});

test("rejects malformed JSON and invalid UTF-8", async () => {
  const malformed = await readBoundedJson(jsonRequest("{"), 1024);
  assert.deepEqual(malformed, { ok: false, status: 400, error: "Invalid JSON body." });

  const invalidUtf8 = new Request("https://example.test/api/v1/agent/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new Uint8Array([0xff, 0xfe]),
  });
  const invalid = await readBoundedJson(invalidUtf8, 1024);
  assert.deepEqual(invalid, {
    ok: false,
    status: 400,
    error: "Request body must be valid UTF-8 JSON.",
  });
});

test("rejects invalid limit configuration", async () => {
  await assert.rejects(() => readBoundedJson(jsonRequest("{}"), 0), /positive safe request-body limit/);
});
