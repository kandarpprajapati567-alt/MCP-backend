import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentToolAccessReport } from "../../../src/server/agent/tool-access";

test("reports assigned, available and denied backend tools separately", () => {
  const report = buildAgentToolAccessReport([
    { id: "text.word_count", description: "Count words", permission: "local_text_read", sideEffect: false, target: "backend" },
    { id: "memory.store", description: "Store memory", permission: "memory.write", sideEffect: true, target: "backend" },
  ], ["text.word_count"]);

  assert.equal(report.tools[0].status, "assigned");
  assert.equal(report.tools[0].assigned, true);
  assert.equal(report.tools[0].assignmentDecision, "allowlisted");
  assert.deepEqual(report.tools[0].denialReasons, []);
  assert.equal(report.tools[0].risk, "read_only");
  assert.equal(report.tools[1].status, "assignment_required");
  assert.equal(report.tools[1].assignmentDecision, "denied");
  assert.deepEqual(report.tools[1].denialReasons, ["not_assigned"]);
  assert.equal(report.tools[1].risk, "side_effect");
  assert.deepEqual(report.summary, {
    total: 2,
    assigned: 1,
    available: 2,
    allowlisted: 1,
    denied: 1,
    assignmentRequired: 1,
    unavailable: 0,
    assignedUnavailable: 0,
  });
});

test("marks an assigned Android capability unavailable when its heartbeat is stale", () => {
  const report = buildAgentToolAccessReport([
    {
      id: "device.camera.capture",
      description: "Capture",
      permission: "camera",
      sideEffect: true,
      target: "device",
      available: false,
      availabilityNote: "Device heartbeat is stale.",
    },
  ], ["device.camera.capture"]);

  assert.equal(report.tools[0].status, "assigned_unavailable");
  assert.equal(report.tools[0].available, false);
  assert.equal(report.tools[0].assignmentDecision, "denied");
  assert.deepEqual(report.tools[0].denialReasons, ["capability_unavailable"]);
  assert.equal(report.summary.allowlisted, 0);
  assert.equal(report.summary.denied, 1);
  assert.equal(report.summary.assignedUnavailable, 1);
});

test("reports unassigned offline tools as both unassigned and unavailable", () => {
  const report = buildAgentToolAccessReport([
    { id: "device.files.read", description: "Read file", permission: "files.read", sideEffect: false, target: "device", available: false },
  ], []);

  assert.equal(report.tools[0].status, "unavailable");
  assert.deepEqual(report.tools[0].denialReasons, ["not_assigned", "capability_unavailable"]);
  assert.equal(report.summary.assignmentRequired, 0);
  assert.equal(report.summary.unavailable, 1);
});

test("reports assigned IDs that are no longer registered or online", () => {
  const report = buildAgentToolAccessReport([], ["remote_mcp.server.tool", "device.files.read"]);

  assert.deepEqual(report.unavailableAssignments, ["remote_mcp.server.tool", "device.files.read"]);
  assert.deepEqual(report.summary, {
    total: 2,
    assigned: 2,
    available: 0,
    allowlisted: 0,
    denied: 2,
    assignmentRequired: 0,
    unavailable: 2,
    assignedUnavailable: 2,
  });
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
