import assert from "node:assert/strict";
import test from "node:test";
import { verifySynthesisIntegrity } from "../../../src/server/agent/synthesis-integrity";

test("reports structural consistency while explicitly not claiming truth verification", () => {
  const report = verifySynthesisIntegrity("Source: https://example.org/a [ev-call-1]", [
    { callId: "call-1", toolId: "web.search", result: { url: "https://example.org/a", title: "Observed" } },
  ]);
  assert.equal(report.status, "structurally_consistent");
  assert.equal(report.toolOperations, 1);
  assert.equal(report.failedOperations, 0);
  assert.equal(report.unsupportedAnswerUrls, 0);
  assert.equal(report.unsupportedEvidenceIds, 0);
  assert.equal(report.uncitedEvidence, false);
  assert.equal(report.independentTruthVerification, "not_performed");
});

test("warns when answer cites a URL absent from successful tool output", () => {
  const report = verifySynthesisIntegrity("See https://invented.example/path", [
    { callId: "call-1", toolId: "web.search", result: { url: "https://source.example" } },
  ]);
  assert.equal(report.status, "warning");
  assert.equal(report.unsupportedAnswerUrls, 1);
});

test("does not accept URLs returned by failed tools as evidence", () => {
  const report = verifySynthesisIntegrity("https://failed.example", [
    { callId: "call-1", toolId: "web.search", result: { ok: false, url: "https://failed.example" } },
  ]);
  assert.equal(report.status, "warning");
  assert.equal(report.failedOperations, 1);
  assert.equal(report.unsupportedAnswerUrls, 1);
});

test("reports missing evidence and partial execution without upgrading the status", () => {
  const empty = verifySynthesisIntegrity("A claim", []);
  assert.equal(empty.status, "warning");
  assert.match(empty.warnings.join(" "), /No tool execution evidence/);

  const partial = verifySynthesisIntegrity("A result", [
    { callId: "call-1", toolId: "text.word_count", result: { wordCount: 4 } },
    { callId: "call-2", toolId: "web.search", result: { status: "failed" } },
  ]);
  assert.equal(partial.status, "warning");
  assert.equal(partial.failedOperations, 1);
});

test("warns when evidence is not cited or an unknown evidence ID is cited", () => {
  const uncited = verifySynthesisIntegrity("A factual conclusion.", [
    { callId: "call-1", toolId: "web.search", result: { title: "Observed" } },
  ]);
  assert.equal(uncited.uncitedEvidence, true);
  assert.match(uncited.warnings.join(" "), /No supplied evidence ID was cited/);

  const unsupported = verifySynthesisIntegrity("Claim [ev-call-99]", [
    { callId: "call-1", toolId: "web.search", result: { title: "Observed" } },
  ]);
  assert.equal(unsupported.unsupportedEvidenceIds, 1);
  assert.equal(unsupported.status, "warning");
});
