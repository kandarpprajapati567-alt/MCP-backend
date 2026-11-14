import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicIpv4Address,
  normalizeRemoteMcpEndpoint,
  sanitizeRemoteTool,
  validateRemoteToolArguments,
} from "../../../src/server/mcp/remote-contract";

test("accepts HTTPS public host endpoints on the default port", () => {
  assert.equal(normalizeRemoteMcpEndpoint("https://mcp.example.com/v1").toString(), "https://mcp.example.com/v1");
});

test("rejects HTTP, credentials, fragments, nonstandard ports and IP literals", () => {
  for (const endpoint of [
    "http://mcp.example.com/mcp",
    "https://user:pass@mcp.example.com/mcp",
    "https://mcp.example.com:8443/mcp",
    "https://mcp.example.com/mcp#fragment",
    "https://mcp.example.com/mcp?token=secret",
    "https://127.0.0.1/mcp",
    "https://[::1]/mcp",
    "https://localhost/mcp",
  ]) assert.throws(() => normalizeRemoteMcpEndpoint(endpoint));
});

test("blocks private, loopback, link-local, shared, documentation and multicast IPv4 ranges", () => {
  for (const address of ["10.0.0.1", "127.0.0.1", "169.254.1.1", "172.16.0.1", "192.168.1.1", "100.64.0.1", "192.0.2.1", "192.88.99.1", "198.51.100.1", "203.0.113.1", "198.18.0.1", "224.0.0.1", "0.1.2.3"]) {
    assert.equal(isPublicIpv4Address(address), false, address);
  }
  for (const address of ["1.1.1.1", "8.8.8.8", "93.184.216.34"]) {
    assert.equal(isPublicIpv4Address(address), true, address);
  }
});

test("accepts only explicitly read-only tools with bounded primitive input schemas", () => {
  const serverId = "123e4567-e89b-42d3-a456-426614174000";
  const tool = sanitizeRemoteTool(serverId, {
    name: "search_docs",
    description: "Search docs",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    inputSchema: { type: "object", properties: { query: { type: "string", minLength: 2, maxLength: 100 }, limit: { type: "integer", minimum: 1, maximum: 10 } }, required: ["query"] },
  });
  assert.ok(tool);
  assert.equal(tool.id, "remote_mcp." + serverId + ".search_docs");
  assert.equal(tool.inputSchema.additionalProperties, false);
  assert.equal(sanitizeRemoteTool(serverId, { name: "write_file", annotations: { readOnlyHint: false }, inputSchema: { type: "object", properties: {} } }), null);
  assert.equal(sanitizeRemoteTool(serverId, { name: "unknown", annotations: {}, inputSchema: { type: "object", properties: {} } }), null);
});

test("validates remote tool arguments against required keys, types and bounds", () => {
  const tool = sanitizeRemoteTool("123e4567-e89b-42d3-a456-426614174000", {
    name: "search_docs",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: { query: { type: "string", minLength: 2, maxLength: 10 }, limit: { type: "integer", minimum: 1, maximum: 5 } }, required: ["query"] },
  });
  assert.ok(tool);
  assert.equal(validateRemoteToolArguments(tool.inputSchema, { query: "agent", limit: 3 }), true);
  assert.equal(validateRemoteToolArguments(tool.inputSchema, { query: "a", limit: 3 }), false);
  assert.equal(validateRemoteToolArguments(tool.inputSchema, { query: "agent", extra: true }), false);
  assert.equal(validateRemoteToolArguments(tool.inputSchema, { query: "agent", limit: 6 }), false);
  assert.equal(validateRemoteToolArguments(tool.inputSchema, { limit: 3 }), false);
});


test("fails closed on malformed remote tool schema bounds", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const base = (property: Record<string, unknown>) => ({
    name: "bounded_lookup",
    annotations: { readOnlyHint: true, destructiveHint: false },
    inputSchema: { type: "object", properties: { query: property }, required: ["query"] },
  });
  assert.equal(sanitizeRemoteTool(id, base({ type: "string", minLength: 8, maxLength: 4 })), null);
  assert.equal(sanitizeRemoteTool(id, base({ type: "string", minLength: 1.5, maxLength: 20 })), null);
  assert.equal(sanitizeRemoteTool(id, base({ type: "integer", minimum: 9, maximum: 2 })), null);
  assert.equal(sanitizeRemoteTool(id, base({ type: "number", minimum: "0", maximum: 2 })), null);
});

test("rejects oversized, nested, and unsafe remote tool schemas", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const base = (properties: Record<string, unknown>) => ({
    name: "lookup",
    annotations: { readOnlyHint: true, destructiveHint: false },
    inputSchema: { type: "object", properties },
  });
  assert.equal(sanitizeRemoteTool(id, base({ nested: { type: "object", properties: {} } })), null);
  assert.equal(sanitizeRemoteTool(id, base({ "bad-key!": { type: "string" } })), null);
  assert.equal(sanitizeRemoteTool(id, base(Object.fromEntries(Array.from({ length: 25 }, (_, index) => ["field" + index, { type: "string" }])))), null);
  assert.equal(sanitizeRemoteTool(id, {
    name: "not safe",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} },
  }), null);
});


test("rejects unsupported schema keywords, unknown required keys and permissive additional properties", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const base = (property: Record<string, unknown>, root: Record<string, unknown> = {}) => ({
    name: "strict_lookup",
    annotations: { readOnlyHint: true, destructiveHint: false },
    inputSchema: { type: "object", properties: { query: property }, ...root },
  });
  assert.equal(sanitizeRemoteTool(id, base({ type: "string", pattern: "^[a-z]+$" })), null);
  assert.equal(sanitizeRemoteTool(id, base({ type: "string", enum: ["safe"] })), null);
  assert.equal(sanitizeRemoteTool(id, base({ type: "string" }, { required: ["missing"] })), null);
  assert.equal(sanitizeRemoteTool(id, base({ type: "string" }, { required: ["query", "query"] })), null);
  assert.equal(sanitizeRemoteTool(id, base({ type: "string" }, { additionalProperties: true })), null);
  assert.equal(sanitizeRemoteTool(id, base({ type: "string" }, { $ref: "#/definitions/query" })), null);
});

test("does not treat inherited object properties as declared Remote MCP arguments", () => {
  const tool = sanitizeRemoteTool("123e4567-e89b-42d3-a456-426614174000", {
    name: "strict_lookup",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  });
  assert.ok(tool);
  assert.equal(validateRemoteToolArguments(tool.inputSchema, JSON.parse('{"query":"ok","toString":"unexpected"}')), false);
});
