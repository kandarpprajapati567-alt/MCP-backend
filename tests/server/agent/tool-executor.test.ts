import assert from "node:assert/strict";
import test from "node:test";

import type { AgentToolDefinition } from "../../../src/server/agent/tool-contract";
import { executeRegisteredTool } from "../../../src/server/agent/tool-executor";
import { AgentToolRegistry } from "../../../src/server/agent/tool-registry";

function makeTool(overrides: Partial<AgentToolDefinition> = {}): AgentToolDefinition {
  return {
    id: "project.read",
    description: "Read a bounded project resource.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", minLength: 1, maxLength: 100 } },
      required: ["path"],
      additionalProperties: false,
    },
    requiredPermissions: ["READ_PROJECT"],
    requiresApproval: false,
    timeoutMs: 100,
    maxOutputBytes: 1024,
    execute: async ({ path }) => ({ path }),
    ...overrides,
  };
}

test("registry rejects duplicate IDs and unsafe tool definitions", () => {
  const registry = new AgentToolRegistry();
  registry.register(makeTool());
  assert.throws(() => registry.register(makeTool()), /already registered/);
  assert.throws(() => registry.register(makeTool({ timeoutMs: 31_000 })), /timeout/);
  assert.throws(() => registry.register(makeTool({
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: true } as never,
  })), /closed object/);
});

test("execution rejects unregistered tools and invalid arguments", async () => {
  const registry = new AgentToolRegistry();
  registry.register(makeTool());
  const base = { registry, context: { userId: "user-1", taskId: "task-1" }, grantedPermissions: ["READ_PROJECT"] as const };
  assert.equal((await executeRegisteredTool({ ...base, toolId: "system.shell", input: {} })).status, "failed");
  const invalid = await executeRegisteredTool({ ...base, toolId: "project.read", input: { path: "../secret", extra: true } });
  assert.equal(invalid.status, "failed");
  if (invalid.status === "failed") assert.equal(invalid.code, "INVALID_ARGUMENTS");
});

test("execution enforces permissions and explicit approval before side effects", async () => {
  let calls = 0;
  const registry = new AgentToolRegistry();
  registry.register(makeTool({
    requiresApproval: true,
    execute: async () => { calls += 1; return { ok: true }; },
  }));
  const base = { registry, toolId: "project.read", input: { path: "README.md" }, context: { userId: "u", taskId: "t" } };
  const denied = await executeRegisteredTool({ ...base, grantedPermissions: [] });
  assert.equal(denied.status, "permission_denied");
  const waiting = await executeRegisteredTool({ ...base, grantedPermissions: ["READ_PROJECT"] });
  assert.equal(waiting.status, "awaiting_approval");
  assert.equal(calls, 0);
  const approved = await executeRegisteredTool({
    ...base, grantedPermissions: ["READ_PROJECT"], approvedToolIds: ["project.read"],
  });
  assert.equal(approved.status, "completed");
  assert.equal(calls, 1);
});

test("execution enforces timeouts and bounded JSON outputs", async () => {
  const registry = new AgentToolRegistry();
  registry.register(makeTool({ execute: async () => new Promise((resolve) => setTimeout(() => resolve("late"), 200)) }));
  const timeout = await executeRegisteredTool({
    registry, toolId: "project.read", input: { path: "a" },
    context: { userId: "u", taskId: "t" }, grantedPermissions: ["READ_PROJECT"],
  });
  assert.equal(timeout.status, "failed");
  if (timeout.status === "failed") assert.equal(timeout.code, "TIMEOUT");

  const outputRegistry = new AgentToolRegistry();
  outputRegistry.register(makeTool({ maxOutputBytes: 5, execute: async () => ({ too: "large" }) }));
  const output = await executeRegisteredTool({
    registry: outputRegistry, toolId: "project.read", input: { path: "a" },
    context: { userId: "u", taskId: "t" }, grantedPermissions: ["READ_PROJECT"],
  });
  assert.equal(output.status, "failed");
  if (output.status === "failed") assert.equal(output.code, "INVALID_OUTPUT");
});
