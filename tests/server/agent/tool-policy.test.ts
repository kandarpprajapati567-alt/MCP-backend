import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAgentToolPolicy, type AgentToolPolicyDescriptor } from "../../../src/server/agent/tool-policy";

const readOnlyTool: AgentToolPolicyDescriptor = {
  id: "web.search", permission: "web.search", sideEffect: false, target: "backend",
};
const writeTool: AgentToolPolicyDescriptor = {
  id: "memory.store", permission: "memory.write", sideEffect: true, target: "backend",
};
const deviceTool: AgentToolPolicyDescriptor = {
  id: "device.camera.capture", permission: "camera.capture", sideEffect: true, target: "device",
};

test("default planner is limited to registered read-only backend and remote tools", () => {
  assert.deepEqual(evaluateAgentToolPolicy(readOnlyTool, null), {
    allowed: true, mode: "default_read_only",
  });
  assert.deepEqual(evaluateAgentToolPolicy({ ...readOnlyTool, target: "remote_mcp" }, null), {
    allowed: true, mode: "default_read_only",
  });
  assert.deepEqual(evaluateAgentToolPolicy(writeTool, null), {
    allowed: false, reason: "default_read_only_only",
  });
  assert.deepEqual(evaluateAgentToolPolicy(deviceTool, null), {
    allowed: false, reason: "default_read_only_only",
  });
});

test("an Agent can execute only tools explicitly assigned to its own allowlist", () => {
  assert.deepEqual(evaluateAgentToolPolicy(writeTool, ["memory.store"]), {
    allowed: true, mode: "agent_allowlist",
  });
  assert.deepEqual(evaluateAgentToolPolicy(readOnlyTool, ["memory.store"]), {
    allowed: false, reason: "tool_not_assigned",
  });
  assert.deepEqual(evaluateAgentToolPolicy(deviceTool, ["device.camera.capture"]), {
    allowed: true, mode: "agent_allowlist",
  });
});

test("unknown tools and missing permission metadata fail closed", () => {
  assert.deepEqual(evaluateAgentToolPolicy(undefined, ["text.word_count"]), {
    allowed: false, reason: "tool_not_registered",
  });
  assert.deepEqual(evaluateAgentToolPolicy({
    id: "text.word_count", permission: " ", sideEffect: false, target: "backend",
  }, ["text.word_count"]), {
    allowed: false, reason: "permission_metadata_missing",
  });
});
