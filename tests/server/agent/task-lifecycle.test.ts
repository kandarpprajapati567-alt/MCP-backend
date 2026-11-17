import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AGENT_TASK_EVENT_TYPES } from "../../../src/server/agent/task-event-types";
import {
  AgentTaskCancelledError,
  getCancellationDisposition,
  isAgentTaskCancellationRequested,
} from "../../../src/server/agent/task-lifecycle";

test("queued and device-waiting tasks can be cancelled immediately", () => {
  assert.equal(getCancellationDisposition("queued"), "cancel_now");
  assert.equal(getCancellationDisposition("awaiting_approval"), "cancel_now");
  assert.equal(getCancellationDisposition("waiting_for_device"), "cancel_now");
});

test("active execution receives a cooperative cancellation request", () => {
  assert.equal(getCancellationDisposition("planning"), "request");
  assert.equal(getCancellationDisposition("executing"), "request");
  assert.equal(getCancellationDisposition("synthesizing"), "request");
});

test("terminal tasks cannot be cancelled again", () => {
  assert.equal(getCancellationDisposition("completed"), "already_terminal");
  assert.equal(getCancellationDisposition("partial"), "already_terminal");
  assert.equal(getCancellationDisposition("needs_review"), "already_terminal");
  assert.equal(getCancellationDisposition("failed"), "already_terminal");
  assert.equal(getCancellationDisposition("cancelled"), "already_terminal");
});

test("unknown lifecycle states fail closed", () => {
  assert.throws(() => getCancellationDisposition("unknown"), /Unknown Agent task status/);
});

test("cancellation timestamps and errors have explicit semantics", () => {
  assert.equal(isAgentTaskCancellationRequested(null), false);
  assert.equal(isAgentTaskCancellationRequested(""), false);
  assert.equal(isAgentTaskCancellationRequested("2026-11-12T10:00:00.000Z"), true);
  assert.ok(new AgentTaskCancelledError() instanceof Error);
});


test("runtime task event vocabulary matches the persisted database constraint", () => {
  const migration = readFileSync(
    "supabase/migrations/20261117120000_agent_completion_integrity.sql",
    "utf8",
  );
  for (const eventType of AGENT_TASK_EVENT_TYPES) {
    assert.ok(migration.includes("'" + eventType + "'"), "Missing persisted event type: " + eventType);
  }
});
