import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicIpv4Address,
  normalizeRemoteMcpEndpoint,
  sanitizeRemoteTool,
  validateRemoteToolArguments,
} from "../../../src/server/mcp/remote";

test("accepts HTTPS public host endpoints on the default port", () => {
  assert.equal(normalizeRemoteMcpEndpoint("https://mcp.example.com/v1").toString(), "https://mcp.example.com/v1");
});

test("rejects HTTP, credentials, fragments, nonstandard ports and IP literals", () => {
  for (const endpoint of [
    "http://mcp.example.com/mcp",
    "https://user:pass@mcp.example.com/mcp",
    "https://mcp.example.com:8443/mcp",
    "https://mcp.example.com/mcp#fragment",
    "https://127.0.0.1/mcp",
    "https://[::1]/mcp",
    "https://localhost/mcp",
  ]) assert.throws(() => normalizeRemoteMcpEndpoint(endpoint));
});

test("blocks private, loopback, link-local, shared, documentation and multicast IPv4 ranges", () => {
  for (const address of ["10.0.0.1", "127.0.0.1", "169.254.1.1", "172.16.0.1", "192.168.1.1", "100.64.0.1", "192.0.2.1", "198.51.100.1", "203.0.113.1", "198.18.0.1", "224.0.0.1", "0.1.2.3"]) {
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
