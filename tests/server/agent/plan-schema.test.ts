import assert from "node:assert/strict";
import test from "node:test";
import {parseAgentPlan} from "../../../src/server/agent/plan-schema";
const validPlan={version:1,goal:"Prepare a project status report.",steps:[{id:"step-1",objective:"Collect verified project status.",expectedOutcome:"A concise status summary."},{id:"step-2",objective:"Organize completed and pending work.",expectedOutcome:"A structured progress report."}],toolCalls:[]};
test("accepts a valid versioned plan",()=>{const result=parseAgentPlan(validPlan);assert.equal(result.ok,true);if(result.ok)assert.equal(result.value.steps.length,2);});
test("rejects unknown keys and unsupported versions",()=>{assert.equal(parseAgentPlan({...validPlan,command:"run shell"}).ok,false);assert.equal(parseAgentPlan({...validPlan,version:2}).ok,false);});
test("rejects empty, oversized, or malformed step lists",()=>{assert.equal(parseAgentPlan({...validPlan,steps:[]}).ok,false);assert.equal(parseAgentPlan({...validPlan,steps:Array(9).fill(validPlan.steps[0])}).ok,false);assert.equal(parseAgentPlan({...validPlan,steps:[null]}).ok,false);});
test("rejects duplicate or invalid step IDs",()=>{const duplicate={...validPlan,steps:[validPlan.steps[0],{...validPlan.steps[1],id:"step-1"}]};assert.equal(parseAgentPlan(duplicate).ok,false);assert.equal(parseAgentPlan({...validPlan,steps:[{...validPlan.steps[0],id:"tool-call"}]}).ok,false);});
test("rejects empty and oversized step text",()=>{assert.equal(parseAgentPlan({...validPlan,goal:""}).ok,false);assert.equal(parseAgentPlan({...validPlan,steps:[{...validPlan.steps[0],objective:" "}]}).ok,false);assert.equal(parseAgentPlan({...validPlan,steps:[{...validPlan.steps[0],expectedOutcome:"x".repeat(301)}]}).ok,false);});
test("rejects unregistered or malformed tool calls",()=>{assert.equal(parseAgentPlan({...validPlan,toolCalls:[{id:"call-1",toolId:"shell.exec",arguments:{command:"ls"}}]}).ok,false);assert.equal(parseAgentPlan({...validPlan,toolCalls:[{id:"call-1",toolId:"text.word_count",arguments:{text:"abc",extra:true}}]}).ok,false);});
test("accepts a bounded registered text tool",()=>{const result=parseAgentPlan({...validPlan,toolCalls:[{id:"call-1",toolId:"text.word_count",arguments:{text:"one two"}}]});assert.equal(result.ok,true);});

test("validates dynamic device tools against their advertised input schema", () => {
  const available = [{
    id: "android.device.battery",
    inputSchema: {
      type: "object" as const,
      properties: { includeHealth: { type: "boolean" } },
      required: [],
      additionalProperties: false,
    },
  }];
  const plan = {
    ...validPlan,
    toolCalls: [{ id: "call-1", toolId: "android.device.battery", arguments: { includeHealth: true } }],
  };
  assert.equal(parseAgentPlan(plan, available).ok, true);
  assert.equal(parseAgentPlan({
    ...plan,
    toolCalls: [{ id: "call-1", toolId: "android.device.battery", arguments: { includeHealth: true, unsafe: true } }],
  }, available).ok, false);
  assert.equal(parseAgentPlan(plan).ok, false);
});


test("enforces Agent-specific maximum step and tool-call counts", () => {
  const tooManySteps = {
    ...validPlan,
    steps: [validPlan.steps[0], validPlan.steps[1]],
  };
  assert.equal(parseAgentPlan(tooManySteps, undefined, { maxSteps: 1 }).ok, false);

  const withToolCall = {
    ...validPlan,
    toolCalls: [{ id: "call-1", toolId: "text.word_count", arguments: { text: "one two" } }],
  };
  assert.equal(parseAgentPlan(withToolCall, undefined, { maxToolCalls: 0 }).ok, false);
  assert.equal(parseAgentPlan(withToolCall, undefined, { maxToolCalls: 1 }).ok, true);
});


test("validates nested objects and array items instead of accepting unchecked containers", () => {
  const available = [{
    id: "device.configure",
    inputSchema: {
      type: "object" as const,
      properties: {
        settings: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["safe", "balanced"] },
            retries: { type: "integer", minimum: 0, maximum: 3 },
          },
          required: ["mode"],
          additionalProperties: false,
        },
        targets: {
          type: "array",
          minItems: 1,
          maxItems: 2,
          items: { type: "string", enum: ["sensor-1", "sensor-2"] },
        },
      },
      required: ["settings", "targets"],
      additionalProperties: false,
    },
  }];
  const makePlan = (args: Record<string, unknown>) => ({
    ...validPlan,
    toolCalls: [{ id: "call-1", toolId: "device.configure", arguments: args }],
  });

  assert.equal(parseAgentPlan(makePlan({
    settings: { mode: "safe", retries: 2 },
    targets: ["sensor-1", "sensor-2"],
  }), available).ok, true);

  assert.equal(parseAgentPlan(makePlan({
    settings: { mode: "unsafe", retries: 2 },
    targets: ["sensor-1"],
  }), available).ok, false);

  assert.equal(parseAgentPlan(makePlan({
    settings: { mode: "safe", retries: 9 },
    targets: ["sensor-1"],
  }), available).ok, false);

  assert.equal(parseAgentPlan(makePlan({
    settings: { mode: "safe", unexpected: true },
    targets: ["sensor-1"],
  }), available).ok, false);

  assert.equal(parseAgentPlan(makePlan({
    settings: { mode: "safe" },
    targets: ["unknown-sensor"],
  }), available).ok, false);

  assert.equal(parseAgentPlan(makePlan({
    settings: { mode: "safe" },
    targets: [],
  }), available).ok, false);
});
