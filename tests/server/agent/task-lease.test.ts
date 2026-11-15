import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
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

const leaseMigration = readFileSync(
  new URL("../../../supabase/migrations/20261115121500_add_agent_task_worker_leases.sql", import.meta.url),
  "utf8",
);

test("database claim uses row locks and caps the shared worker batch", () => {
  assert.match(leaseMigration, /for update skip locked/i);
  assert.match(leaseMigration, /least\(3, coalesce\(p_limit, 3\)\)/i);
  assert.match(leaseMigration, /lease_token = pg_catalog\.gen_random_uuid\(\)/i);
});

test("task writes and events are fenced by the active worker lease", () => {
  assert.match(leaseMigration, /'task\.claimed'/i);
  assert.match(leaseMigration, /renew_agent_task_lease/i);
  assert.match(leaseMigration, /append_agent_task_event/i);
  assert.match(leaseMigration, /finish_agent_task/i);
  assert.match(leaseMigration, /t\.worker_id = p_worker_id/i);
  assert.match(leaseMigration, /t\.lease_token = p_lease_token/i);
  assert.match(leaseMigration, /t\.lease_expires_at > pg_catalog\.now\(\)/i);
});

test("expired leases are recorded without automatic replay", () => {
  assert.match(leaseMigration, /recover_expired_agent_task_leases/i);
  assert.match(leaseMigration, /'automaticReplay', false/i);
  assert.match(leaseMigration, /'AGENT_WORKER_INTERRUPTED'/i);
  assert.match(leaseMigration, /'AGENT_TASK_CANCELLED'/i);
});

test("lease RPC execution is restricted to the server service role", () => {
  assert.match(leaseMigration, /revoke all on function public\.claim_agent_tasks/i);
  assert.match(leaseMigration, /grant execute on function public\.claim_agent_tasks.*to service_role/i);
  assert.match(leaseMigration, /grant execute on function public\.finish_agent_task.*to service_role/i);
});
