import assert from "node:assert/strict";
import test from "node:test";
import { AIProviderError } from "../../../src/server/ai/providers/types";
import { safeAgentFailureMessage } from "../../../src/server/agent/failure-diagnostics";

test("shows curated provider diagnostics", () => {
  assert.equal(
    safeAgentFailureMessage(new AIProviderError("INVALID_REQUEST", "A valid messages array is required.")),
    "INVALID_REQUEST: A valid messages array is required.",
  );
});

test("shows known planner validation errors", () => {
  assert.equal(safeAgentFailureMessage(new Error("Planner returned invalid JSON.")), "Planner returned invalid JSON.");
  assert.equal(safeAgentFailureMessage(new Error("Tool arguments failed the registered input schema.")), "Tool arguments failed the registered input schema.");
});

test("hides arbitrary exception details", () => {
  assert.equal(
    safeAgentFailureMessage(new Error("database password=do-not-expose")),
    "Unexpected internal error. Check server logs using the task ID.",
  );
  assert.equal(safeAgentFailureMessage("unexpected"), "Unexpected internal error. Check server logs using the task ID.");
});

test("shows safe local planner policy and input diagnostics", () => {
  assert.equal(
    safeAgentFailureMessage(new Error("This Agent cannot use web.search. Assign the approved web.search tool in Agent Manager, then retry.")),
    "This Agent cannot use web.search. Assign the approved web.search tool in Agent Manager, then retry.",
  );
  assert.equal(
    safeAgentFailureMessage(new Error("Add the text to process after a colon, for example: Count words in: apple banana.")),
    "Add the text to process after a colon, for example: Count words in: apple banana.",
  );
});

test("shows curated GitHub connectivity diagnostics", () => {
  assert.equal(
    safeAgentFailureMessage(new Error("GitHub read request timed out after 15 seconds.")),
    "GitHub read request timed out after 15 seconds.",
  );
  assert.equal(
    safeAgentFailureMessage(new Error("GitHub read request failed with HTTP 403.")),
    "GitHub read request failed with HTTP 403.",
  );
});
