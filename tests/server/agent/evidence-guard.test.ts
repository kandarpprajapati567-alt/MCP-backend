import assert from "node:assert/strict";
import test from "node:test";
import { guardSynthesisAnswer } from "../../../src/server/agent/evidence-guard";

test("labels generated synthesis as unverified when no source URL was returned", () => {
  const result = guardSynthesisAnswer("The answer is definitely 42.", []);
  assert.match(result, /UNVERIFIED — NO SOURCE URL WAS RETURNED BY TOOLS/);
  assert.match(result, /Tool outputs are observations, not proof of real-world accuracy/);
  assert.match(result, /The answer is definitely 42\./);
});

test("preserves evidence URLs and removes model-invented URLs", () => {
  const result = guardSynthesisAnswer(
    "Source: https://example.org/real. More here: https://invented.invalid/fake",
    [{
      callId: "call-1",
      toolId: "web.search",
      result: { url: "https://example.org/real", title: "Observed source result" },
    }],
  );
  assert.match(result, /SOURCE REFERENCES PRESENT — NOT INDEPENDENTLY VERIFIED/);
  assert.match(result, /https:\/\/example\.org\/real/);
  assert.doesNotMatch(result, /https:\/\/invented\.invalid/);
  assert.match(result, /1 URL\(s\) not present in tool evidence were removed/);
});

test("does not treat a tool-reported failure as a source reference", () => {
  const result = guardSynthesisAnswer(
    "No reliable conclusion. https://made-up.example",
    [{ callId: "call-1", toolId: "web.search", result: { ok: false, error: "unavailable" } }],
  );
  assert.match(result, /UNVERIFIED — NO SOURCE URL WAS RETURNED BY TOOLS/);
  assert.match(result, /\[unverified URL omitted\]/);
});
