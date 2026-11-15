import assert from "node:assert/strict";
import test from "node:test";
import { selectZeroCostLiveTest } from "../../../src/lib/agent-system-test-policy";

const baseAgent = {
  enabled: true,
  provider_preference: "mock",
  allowed_tools: ["text.word_count"],
};

test("allows only an explicitly Mock-backed local word-count Agent", () => {
  const decision = selectZeroCostLiveTest(baseAgent, [
    { id: "text.word_count", sideEffect: false },
  ]);
  assert.equal(decision.eligible, true);
  if (decision.eligible) {
    assert.equal(decision.test.expected, "text.word_count");
    assert.match(decision.test.prompt, /alpha beta gamma delta/);
  }
});

test("rejects automatic and external model provider preferences", () => {
  for (const provider_preference of ["auto", "openai", "openrouter"]) {
    const decision = selectZeroCostLiveTest(
      { ...baseAgent, provider_preference },
      [{ id: "text.word_count", sideEffect: false }],
    );
    assert.equal(decision.eligible, false);
    if (!decision.eligible) assert.match(decision.reason, /Mock provider/);
  }
});

test("rejects Remote MCP, web, GitHub and device tools from zero-cost Live mode", () => {
  for (const id of [
    "remote_mcp.00000000-0000-4000-8000-000000000001.lookup",
    "web.search",
    "github.read_file",
    "device.list",
  ]) {
    const decision = selectZeroCostLiveTest(
      { ...baseAgent, allowed_tools: [id] },
      [{ id, sideEffect: false }],
    );
    assert.equal(decision.eligible, false);
    if (!decision.eligible) assert.match(decision.reason, /non-local tool/);
  }
});

test("rejects any assigned tool that is not explicitly read-only", () => {
  const decision = selectZeroCostLiveTest(
    { ...baseAgent, allowed_tools: ["text.word_count", "text.text_stats"] },
    [
      { id: "text.word_count", sideEffect: false },
      { id: "text.text_stats", sideEffect: true },
    ],
  );
  assert.equal(decision.eligible, false);
  if (!decision.eligible) assert.match(decision.reason, /not explicitly marked read-only/);
});

test("rejects missing assignments and stale tool IDs", () => {
  const noTools = selectZeroCostLiveTest(
    { ...baseAgent, allowed_tools: [] },
    [{ id: "text.word_count", sideEffect: false }],
  );
  assert.equal(noTools.eligible, false);

  const stale = selectZeroCostLiveTest(baseAgent, []);
  assert.equal(stale.eligible, false);
  if (!stale.eligible) assert.match(stale.reason, /not present in the current registry/);
});

test("rejects disabled Agents and unsupported local tool names", () => {
  const disabled = selectZeroCostLiveTest(
    { ...baseAgent, enabled: false },
    [{ id: "text.word_count", sideEffect: false }],
  );
  assert.equal(disabled.eligible, false);

  const unsupported = selectZeroCostLiveTest(
    { ...baseAgent, allowed_tools: ["text.custom"] },
    [{ id: "text.custom", sideEffect: false }],
  );
  assert.equal(unsupported.eligible, false);
  if (!unsupported.eligible) assert.match(unsupported.reason, /No supported deterministic local text test/);
});
