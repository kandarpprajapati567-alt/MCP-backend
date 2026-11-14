import assert from "node:assert/strict";
import test from "node:test";
import {
  createAgentTaskRetryKey,
  evaluateSafeAgentTaskRetry,
  parseAgentTaskRetryKey,
} from "../../../src/server/agent/task-retry-policy";

const rootTaskId = "123e4567-e89b-12d3-a456-426614174000";
const safe = {
  status: "failed", errorCode: "AGENT_EXECUTION_FAILED", failedStage: "planning",
  plan: null, toolResults: [], cancellationRequestedAt: null,
  hasToolActivity: false, hasDeviceJobs: false, retryCount: 0,
  isLatestAttempt: true, retryInProgress: false,
};

test("permits retries only for side-effect-free planning failures", () => {
  assert.deepEqual(evaluateSafeAgentTaskRetry(safe), { allowed: true, nextAttempt: 1 });
  assert.deepEqual(evaluateSafeAgentTaskRetry({ ...safe, errorCode: "AGENT_WORKER_INTERRUPTED" }), { allowed: true, nextAttempt: 1 });
});

test("refuses active, cancelled and non-planning failures", () => {
  assert.deepEqual(evaluateSafeAgentTaskRetry({ ...safe, status: "executing" }), { allowed: false, reason: "NOT_FAILED" });
  assert.deepEqual(evaluateSafeAgentTaskRetry({ ...safe, cancellationRequestedAt: "2026-11-14T00:00:00.000Z" }), { allowed: false, reason: "CANCELLED" });
  assert.deepEqual(evaluateSafeAgentTaskRetry({ ...safe, failedStage: "tool_execution" }), { allowed: false, reason: "UNSAFE_FAILURE" });
  assert.deepEqual(evaluateSafeAgentTaskRetry({ ...safe, errorCode: "AGENT_EXECUTION_REJECTED" }), { allowed: false, reason: "UNSAFE_FAILURE" });
});

test("refuses retries after any plan, result, tool activity or device job", () => {
  assert.deepEqual(evaluateSafeAgentTaskRetry({ ...safe, plan: { toolCalls: [] } }), { allowed: false, reason: "PLAN_ALREADY_CREATED" });
  assert.deepEqual(evaluateSafeAgentTaskRetry({ ...safe, toolResults: [{}] }), { allowed: false, reason: "TOOL_RESULTS_PRESENT" });
  assert.deepEqual(evaluateSafeAgentTaskRetry({ ...safe, hasToolActivity: true }), { allowed: false, reason: "TOOL_ACTIVITY_PRESENT" });
  assert.deepEqual(evaluateSafeAgentTaskRetry({ ...safe, hasDeviceJobs: true }), { allowed: false, reason: "DEVICE_JOB_PRESENT" });
});

test("refuses stale attempts, concurrent retries and retry-limit exhaustion", () => {
  assert.deepEqual(evaluateSafeAgentTaskRetry({ ...safe, isLatestAttempt: false }), { allowed: false, reason: "STALE_ATTEMPT" });
  assert.deepEqual(evaluateSafeAgentTaskRetry({ ...safe, retryInProgress: true }), { allowed: false, reason: "RETRY_IN_PROGRESS" });
  assert.deepEqual(evaluateSafeAgentTaskRetry({ ...safe, retryCount: 2 }), { allowed: false, reason: "MAX_RETRIES" });
  assert.deepEqual(evaluateSafeAgentTaskRetry({ ...safe, retryCount: -1 }), { allowed: false, reason: "INVALID_RETRY_COUNT" });
});

test("retry lineage keys are strict and capped at two attempts", () => {
  const key = createAgentTaskRetryKey(rootTaskId, 2);
  assert.equal(key, "fs-retry:" + rootTaskId + ":2");
  assert.deepEqual(parseAgentTaskRetryKey(key), { rootTaskId, attempt: 2 });
  assert.equal(parseAgentTaskRetryKey("fs-retry:" + rootTaskId + ":3"), null);
  assert.equal(parseAgentTaskRetryKey("fs-retry:../../etc/passwd:1"), null);
  assert.throws(() => createAgentTaskRetryKey(rootTaskId, 3));
});
