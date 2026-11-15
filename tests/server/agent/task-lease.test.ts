import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_TASK_LEASE_HEARTBEAT_MS,
  AGENT_TASK_LEASE_SECONDS,
  AGENT_TASK_WORKER_BATCH_LIMIT,
  getAgentTaskLeaseRecoveryDisposition,
  isAgentTaskLeaseCurrent,
  type AgentTaskLease,
} from "../../../src/server/agent/task-lease";

const lease: AgentTaskLease = { workerId: "worker-a", token: "lease-token-a" };

test("lease bounds remain small and compatible with the worker batch limit", () => {
  assert.equal(AGENT_TASK_LEASE_SECONDS, 90);
  assert.equal(AGENT_TASK_LEASE_HEARTBEAT_MS, 20_000);
  assert.equal(AGENT_TASK_WORKER_BATCH_LIMIT, 3);
  assert.ok(AGENT_TASK_LEASE_HEARTBEAT_MS < AGENT_TASK_LEASE_SECONDS * 1000 / 2);
});

test("a lease is current only for its exact worker, token and future expiry", () => {
  const now = Date.parse("2026-11-15T12:00:00.000Z");
  const record = {
    worker_id: "worker-a",
    lease_token: "lease-token-a",
    lease_expires_at: "2026-11-15T12:01:30.000Z",
  };
  assert.equal(isAgentTaskLeaseCurrent(lease, record, now), true);
  assert.equal(isAgentTaskLeaseCurrent(lease, { ...record, worker_id: "worker-b" }, now), false);
  assert.equal(isAgentTaskLeaseCurrent(lease, { ...record, lease_token: "other-token" }, now), false);
  assert.equal(isAgentTaskLeaseCurrent(lease, { ...record, lease_expires_at: "2026-11-15T11:59:59.000Z" }, now), false);
  assert.equal(isAgentTaskLeaseCurrent(lease, { ...record, lease_expires_at: "not-a-date" }, now), false);
  assert.equal(isAgentTaskLeaseCurrent(lease, { ...record, lease_expires_at: null }, now), false);
});

test("expired active work is failed unless cancellation was already requested", () => {
  assert.equal(getAgentTaskLeaseRecoveryDisposition("planning", null), "failed");
  assert.equal(getAgentTaskLeaseRecoveryDisposition("executing", undefined), "failed");
  assert.equal(getAgentTaskLeaseRecoveryDisposition("synthesizing", "2026-11-15T11:59:00.000Z"), "cancelled");
});

test("terminal and device-waiting tasks are not reclaimed by the worker lease recovery path", () => {
  for (const status of ["completed", "failed", "cancelled", "queued", "waiting_for_device", "awaiting_approval"]) {
    assert.equal(getAgentTaskLeaseRecoveryDisposition(status, null), null, status);
  }
});
