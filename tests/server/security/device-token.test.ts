import assert from "node:assert/strict";
import test from "node:test";
import { equalDeviceSecret, hashDeviceSecret, isDeviceBearerToken } from "../../../src/server/security/device-token";

test("device secrets are stored as stable one-way SHA-256 hashes", () => {
  const token = "fsd_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
  const hash = hashDeviceSecret(token);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hashDeviceSecret(token), hash);
  assert.notEqual(hash, token);
});

test("device token comparison is constant-time and rejects mismatches", () => {
  assert.equal(equalDeviceSecret("same-secret", "same-secret"), true);
  assert.equal(equalDeviceSecret("same-secret", "other-secret"), false);
  assert.equal(equalDeviceSecret("short", "much-longer"), false);
});

test("device bearer token format is bounded", () => {
  assert.equal(isDeviceBearerToken("fsd_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"), true);
  assert.equal(isDeviceBearerToken("owner-master-token"), false);
  assert.equal(isDeviceBearerToken("fsd_short"), false);
});
