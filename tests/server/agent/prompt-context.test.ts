import assert from "node:assert/strict";
import test from "node:test";
import { buildPlannerSystemPrompt } from "../../../src/server/agent/prompt-context";

test("bounds planner prompt with long agent instructions and large device manifests", () => {
  const tools = Array.from({ length: 24 }, (_, index) => ({
    id: "android.test.tool" + index,
    description: "d".repeat(500),
    deviceId: "device-" + index,
    inputSchema: {
      type: "object" as const,
      properties: Object.fromEntries(Array.from({ length: 32 }, (_, property) => [
        "field" + property,
        { type: "string", maxLength: 20_000, description: "schema description".repeat(10) },
      ])),
      required: ["field0"],
      additionalProperties: false,
    },
  }));
  const agent = {
    name: "Test Agent",
    description: "",
    role: "Research specialist",
    instructions: "i".repeat(12_000),
    providerPreference: "auto" as const,
    modelPreference: null,
    allowedTools: tools.map((tool) => tool.id),
    maxSteps: 8,
    maxToolCalls: 4,
    enabled: true,
  };
  const prompt = buildPlannerSystemPrompt(tools, agent);
  assert.ok(prompt.length <= 7_600);
  assert.ok(prompt.length + 4_000 <= 12_000);
  assert.match(prompt, /omittedTools/);
});

test("keeps default planner prompt compact and preserves available tool schemas", () => {
  const tools = [{
    id: "github.read_file",
    description: "Read a bounded text file.",
    inputSchema: {
      type: "object" as const,
      properties: { path: { type: "string", minLength: 1, maxLength: 240 } },
      required: ["path"],
      additionalProperties: false,
    },
  }];
  const prompt = buildPlannerSystemPrompt(tools);
  assert.ok(prompt.length < 7_600);
  assert.match(prompt, /github.read_file/);
  assert.match(prompt, /"required":\["path"\]/);
});

test("advertises expanded default planning and tool-call capacity", () => {
  const prompt = buildPlannerSystemPrompt([]);
  assert.match(prompt, /Use 1–16 steps and at most 8 tool calls/);
});
