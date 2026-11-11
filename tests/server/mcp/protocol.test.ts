import assert from "node:assert/strict";
import test from "node:test";
import { handleMcpRequest } from "../../../src/server/mcp/handler";

const original = process.env.FS_OWNER_TOKEN;
const ownerToken = "test-owner-token-which-is-long-enough-1234567890";
test.before(() => { process.env.FS_OWNER_TOKEN = ownerToken; });
test.after(() => {
  if (original === undefined) delete process.env.FS_OWNER_TOKEN;
  else process.env.FS_OWNER_TOKEN = original;
});

function request(body: unknown, version?: string) {
  return new Request("https://backend.example/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer " + ownerToken,
      ...(version ? { "MCP-Protocol-Version": version } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function result(response: Response) {
  return response.json() as Promise<{ result?: Record<string, unknown>; error?: { code: number; message: string } }>;
}

test("initialize negotiates a supported protocol version and advertises capabilities", async () => {
  const response = await handleMcpRequest(request({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2026-07-28", capabilities: {}, clientInfo: { name: "test-client", version: "1.0" } },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("MCP-Protocol-Version"), "2026-07-28");
  const body = await result(response);
  assert.equal(body.result?.protocolVersion, "2026-07-28");
  assert.ok(body.result?.capabilities);
});

test("tools/list exposes registered tools with JSON input schemas", async () => {
  const response = await handleMcpRequest(request({ jsonrpc: "2.0", id: 2, method: "tools/list" }, "2026-07-28"));
  const body = await result(response);
  const tools = body.result?.tools as Array<{ name: string; inputSchema: { additionalProperties: boolean } }>;
  assert.equal(tools.length, 15);
  assert.equal(tools.some((tool) => tool.name === "models.list_providers"), true);
  assert.equal(tools.some((tool) => tool.name === "models.provider_info"), true);
  assert.equal(tools.some((tool) => tool.name === "github.list_branches"), true);
  assert.equal(tools.some((tool) => tool.name === "github.list_commits"), true);
  assert.equal(tools.some((tool) => tool.name === "github.list_files"), true);
  assert.equal(tools.some((tool) => tool.name === "github.read_file"), true);
  assert.equal(tools.some((tool) => tool.name === "text.word_count"), true);
  assert.equal(tools[0].inputSchema.additionalProperties, false);
});

test("tools/call executes only the registered bounded text tool", async () => {
  const response = await handleMcpRequest(request({
    jsonrpc: "2.0", id: "call-1", method: "tools/call",
    params: { name: "text.word_count", arguments: { text: "Futuristic System is ready" } },
  }, "2026-07-28"));
  const body = await result(response);
  const content = body.result?.content as Array<{ text: string }>;
  assert.equal(body.result?.isError, false);
  assert.deepEqual(JSON.parse(content[0].text), { wordCount: 4 });
});

test("resources and prompts are discoverable", async () => {
  const resources = await handleMcpRequest(request({ jsonrpc: "2.0", id: 3, method: "resources/list" }, "2026-07-28"));
  const prompts = await handleMcpRequest(request({ jsonrpc: "2.0", id: 4, method: "prompts/list" }, "2026-07-28"));
  assert.equal((await result(resources)).result?.resources instanceof Array, true);
  assert.equal((await result(prompts)).result?.prompts instanceof Array, true);
});

test("rejects missing protocol version, bad auth, and unsupported content type", async () => {
  const missingVersion = await handleMcpRequest(request({ jsonrpc: "2.0", id: 5, method: "ping" }));
  assert.equal(missingVersion.status, 400);

  const badAuth = new Request("https://backend.example/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer invalid-token" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 6, method: "initialize", params: {} }),
  });
  assert.equal((await handleMcpRequest(badAuth)).status, 401);

  const badContentType = new Request("https://backend.example/api/mcp", {
    method: "POST",
    headers: { "content-type": "text/plain", accept: "application/json, text/event-stream", authorization: "Bearer " + ownerToken },
    body: "{}",
  });
  assert.equal((await handleMcpRequest(badContentType)).status, 415);
});
