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

test("labels mixed tool outcomes as partial and lists failed operations", () => {
  const result = guardSynthesisAnswer("One operation succeeded.", [
    { callId: "call-1", toolId: "web.search", result: { ok: true, items: [] } },
    { callId: "call-2", toolId: "github.read_file", result: { ok: false, error: "not found" } },
  ]);
  assert.match(result, /EXECUTION STATUS: PARTIAL — 1 of 2 tool operation\(s\) did not succeed/);
  assert.match(result, /github\.read_file: failed/);
  assert.match(result, /Do not describe failed operations as completed/);
});

test("labels all failed tool outcomes as failed, including device job failures", () => {
  const result = guardSynthesisAnswer("The operation is complete.", [
    {
      callId: "call-1",
      toolId: "android.files.read",
      result: { status: "failed", result: null, errorCode: "PERMISSION_DENIED" },
    },
  ]);
  assert.match(result, /EXECUTION STATUS: FAILED — 1 of 1 tool operation\(s\) did not succeed/);
  assert.match(result, /android\.files\.read: failed/);
  assert.match(result, /The operation is complete\./);
});

test("does not authorize citations returned by failed tool calls", () => {
  const result = guardSynthesisAnswer(
    "The failed tool mentioned https://example.org/untrusted",
    [{
      callId: "call-1",
      toolId: "web.search",
      result: { ok: false, error: "request failed", url: "https://example.org/untrusted" },
    }],
  );
  assert.match(result, /UNVERIFIED — NO SOURCE URL WAS RETURNED BY TOOLS/);
  assert.doesNotMatch(result, /https:\/\/example\.org\/untrusted/);
  assert.match(result, /\[unverified URL omitted\]/);
});
