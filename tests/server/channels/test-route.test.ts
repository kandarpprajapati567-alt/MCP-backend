import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../../../src/app/api/v1/channels/test/route";

const previousToken = process.env.FS_OWNER_TOKEN;
const ownerToken = "test-owner-token-with-at-least-32-characters";

test("channel Test Center endpoint rejects unauthenticated requests", async () => {
  const response = await POST(new Request("https://example.test/api/v1/channels/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ testId: "all" }),
  }));
  assert.equal(response.status, 401);
});

test("channel Test Center endpoint runs the real selected contract checks for owner", async () => {
  process.env.FS_OWNER_TOKEN = ownerToken;
  try {
    const response = await POST(new Request("https://example.test/api/v1/channels/test", {
      method: "POST",
      headers: { "content-type": "application/json", "x-fs-owner-token": ownerToken },
      body: JSON.stringify({ testId: "all" }),
    }));
    const data = await response.json() as { summary: { total: number; passed: number; failed: number }; results: Array<{ status: string }> };
    assert.equal(response.status, 200);
    assert.equal(data.summary.total, 5);
    assert.equal(data.summary.passed, 5);
    assert.equal(data.summary.failed, 0);
    assert.ok(data.results.every((result) => result.status === "passed"));
  } finally {
    if (previousToken === undefined) delete process.env.FS_OWNER_TOKEN;
    else process.env.FS_OWNER_TOKEN = previousToken;
  }
});

test("channel Test Center endpoint rejects unknown check IDs", async () => {
  process.env.FS_OWNER_TOKEN = ownerToken;
  try {
    const response = await POST(new Request("https://example.test/api/v1/channels/test", {
      method: "POST",
      headers: { "content-type": "application/json", "x-fs-owner-token": ownerToken },
      body: JSON.stringify({ testId: "run-shell" }),
    }));
    assert.equal(response.status, 400);
  } finally {
    if (previousToken === undefined) delete process.env.FS_OWNER_TOKEN;
    else process.env.FS_OWNER_TOKEN = previousToken;
  }
});
