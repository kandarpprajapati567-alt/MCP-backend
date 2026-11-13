import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentToolAccessReport } from "../../../src/server/agent/tool-access";

test("reports explicitly assigned and unassigned registered tools", () => {
  const report = buildAgentToolAccessReport([
    { id: "text.word_count", description: "Count words", permission: "local_text_read", sideEffect: false, target: "backend" },
    { id: "memory.store", description: "Store memory", permission: "memory.write", sideEffect: true, target: "backend" },
  ], ["text.word_count"]);

  assert.equal(report.tools[0].status, "assigned");
  assert.equal(report.tools[0].risk, "read_only");
  assert.equal(report.tools[1].status, "assignment_required");
  assert.equal(report.tools[1].risk, "side_effect");
  assert.deepEqual(report.summary, {
    total: 2, assigned: 1, assignmentRequired: 1, unavailable: 0, assignedUnavailable: 0,
  });
});

test("distinguishes offline device capabilities from missing assignments", () => {
  const report = buildAgentToolAccessReport([
    { id: "device.camera.capture", description: "Capture", permission: "camera", sideEffect: true, target: "device", available: false },
  ], ["device.camera.capture"]);

  assert.equal(report.tools[0].status, "assigned_unavailable");
  assert.equal(report.tools[0].available, false);
  assert.equal(report.summary.assignedUnavailable, 1);
});

test("reports assigned IDs that are no longer registered or online", () => {
  const report = buildAgentToolAccessReport([], ["remote_mcp.server.tool", "device.files.read"]);

  assert.deepEqual(report.unavailableAssignments, ["remote_mcp.server.tool", "device.files.read"]);
  assert.equal(report.summary.unavailable, 2);
  assert.equal(report.summary.assignedUnavailable, 2);
});

test("deduplicates tool IDs and does not mutate the caller's allowlist", () => {
  const allowed = ["text.word_count"];
  const report = buildAgentToolAccessReport([
    { id: "text.word_count", description: "first", permission: "read", sideEffect: false, target: "backend" },
    { id: "text.word_count", description: "duplicate", permission: "write", sideEffect: true, target: "device" },
  ], allowed);

  assert.equal(report.tools.length, 1);
  assert.equal(report.tools[0].description, "first");
  assert.deepEqual(allowed, ["text.word_count"]);
});
