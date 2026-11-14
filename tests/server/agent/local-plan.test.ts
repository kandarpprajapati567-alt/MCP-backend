import assert from "node:assert/strict";
import test from "node:test";
import { buildLocalAgentPlan } from "../../../src/server/agent/local-plan";
import type { AgentDefinitionInput } from "../../../src/server/agent/definition-schema";

const agent = (allowedTools: string[]): AgentDefinitionInput => ({
  name: "Text helper", description: "", role: "Text helper", instructions: "Process supplied text.",
  providerPreference: "mock", modelPreference: null, allowedTools, maxSteps: 4, maxToolCalls: 2, enabled: true,
});

test("word count extracts only the text after the instruction", () => {
  const plan = buildLocalAgentPlan("Count words in: apple banana", agent(["text.word_count"]));
  assert.deepEqual(plan.toolCalls[0], { id: "call-1", toolId: "text.word_count", arguments: { text: "apple banana" } });
});

test("word count supports natural language without a colon", () => {
  const plan = buildLocalAgentPlan("Count words in apple banana", agent(["text.word_count"]));
  assert.equal(plan.toolCalls[0].arguments.text, "apple banana");
});

test("keyword and text-stat tools receive only their source text", () => {
  assert.equal(buildLocalAgentPlan("Extract keywords from: solar energy and wind", agent(["text.extract_keywords"])).toolCalls[0].arguments.text, "solar energy and wind");
  assert.equal(buildLocalAgentPlan("Text stats for: hello world.", agent(["text.text_stats"])).toolCalls[0].arguments.text, "hello world.");
});

test("does not report a tool task as successful when the Agent has not been assigned that tool", () => {
  assert.throws(() => buildLocalAgentPlan("Count words in: apple banana", agent([])), /Assign the tool in Agent Manager/);
});

test("asks for source text instead of processing the whole instruction", () => {
  assert.throws(() => buildLocalAgentPlan("Count words", agent(["text.word_count"])), /Add the text to process/);
});


test("local research planner emits only the allow-listed web search tool", () => {
  const researchAgent = agent(["web.search"]);
  const plan = buildLocalAgentPlan(
    "Research the official Render documentation for deploying a Next.js application.",
    researchAgent,
  );
  assert.deepEqual(plan.toolCalls, [{
    id: "call-1",
    toolId: "web.search",
    arguments: {
      query: "Research the official Render documentation for deploying a Next.js application.",
      maxResults: 5,
    },
  }]);
});

test("local research planner rejects Agents without web search permission", () => {
  assert.throws(
    () => buildLocalAgentPlan("Research official Render documentation", agent(["text.word_count"])),
    /cannot use web.search/,
  );
});
