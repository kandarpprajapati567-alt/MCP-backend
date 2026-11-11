import assert from "node:assert/strict";
import test from "node:test";
import { buildSynthesisSystemPrompt, buildSynthesisUserContent } from "../../../src/server/agent/synthesis-context";

test("keeps large tool output within provider message limits", () => {
  const content = buildSynthesisUserContent(
    "Inspect repository",
    { goal: "read files" },
    [{ callId: "call-1", toolId: "github.read_file", result: { content: "x".repeat(25_000) } }],
  );
  assert.ok(content.length <= 3_500);
  const parsed = JSON.parse(content);
  assert.equal(parsed.toolResults[0].callId, "call-1");
  assert.equal(parsed.toolResults[0].resultTruncated, true);
});

test("bounds combined task, plan and multiple tool results", () => {
  const content = buildSynthesisUserContent(
    "t".repeat(5_000),
    { plan: "p".repeat(10_000) },
    Array.from({ length: 30 }, (_, index) => ({
      callId: "call-" + index,
      toolId: "github.read_file",
      result: { content: "r".repeat(8_000) },
    })),
  );
  assert.ok(content.length <= 3_500);
  const parsed = JSON.parse(content);
  assert.equal(parsed.taskTruncated, true);
  assert.equal(parsed.planTruncated, true);
  assert.ok(parsed.toolResults.length > 0);
  assert.ok(parsed.omittedToolResults > 0);
});

test("preserves small synthesis context without truncation", () => {
  const content = buildSynthesisUserContent(
    "Summarize the repository",
    { goal: "inspect" },
    [{ callId: "call-1", toolId: "github.list_files", result: { count: 3 } }],
  );
  const parsed = JSON.parse(content);
  assert.equal(parsed.taskTruncated, false);
  assert.equal(parsed.planTruncated, false);
  assert.equal(parsed.toolResults[0].resultTruncated, false);
  assert.deepEqual(JSON.parse(parsed.toolResults[0].resultExcerpt), { count: 3 });
});

test("keeps agent instructions inside the provider system-message limit", () => {
  const prompt = buildSynthesisSystemPrompt("specialist", "i".repeat(12_000));
  assert.ok(prompt.length <= 4_000);
  assert.match(prompt, /Agent guidance \(truncated when necessary\)/);
});
