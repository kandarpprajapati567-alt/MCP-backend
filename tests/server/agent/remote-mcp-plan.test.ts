import assert from "node:assert/strict";
import test from "node:test";
import { parseAgentPlan, type AgentAvailableTool } from "../../../src/server/agent/plan-schema";

const remoteTool: AgentAvailableTool = {
  id: "remote_mcp.123e4567-e89b-42d3-a456-426614174000.search_docs",
  description: "Read-only remote document search",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", minLength: 1, maxLength: 100 } },
    required: ["query"],
    additionalProperties: false,
  },
};
const plan = {
  version: 1,
  goal: "Search approved documentation",
  steps: [{ id: "step-1", objective: "Search the connected read-only server", expectedOutcome: "Relevant document references" }],
  toolCalls: [{ id: "call-1", toolId: remoteTool.id, arguments: { query: "agent orchestration" } }],
};

test("accepts a remote MCP call only when its exact tool ID is allow-listed", () => {
  assert.equal(parseAgentPlan(plan, [remoteTool]).ok, true);
  const denied = parseAgentPlan(plan, []);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.match(denied.error, /not currently available/);
});

test("validates remote MCP arguments with the sanitized schema", () => {
  const invalid = { ...plan, toolCalls: [{ ...plan.toolCalls[0], arguments: { query: "x".repeat(101) } }] };
  const result = parseAgentPlan(invalid, [remoteTool]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /schema/);
});
