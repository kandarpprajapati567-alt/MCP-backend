import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDeviceJobDispatch,
  parseDeviceJobResult,
  parseDeviceRegistration,
} from "../../../src/server/agent/device-contract";

test("device registration accepts bounded capability schemas", () => {
  const parsed = parseDeviceRegistration({
    deviceId: "android-main",
    displayName: "Futuristic System Android",
    platform: "android",
    appVersion: "0.2.0",
    capabilities: [{
      id: "android.device.battery",
      description: "Read battery status.",
      permission: "device.read_battery",
      sideEffect: false,
      inputSchema: {
        type: "object",
        properties: { includeHealth: { type: "boolean" } },
        required: [],
        additionalProperties: false,
      },
    }],
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.capabilities[0].id, "android.device.battery");
});

test("device registration rejects duplicate ids and permissive schemas", () => {
  const capability = {
    id: "android.files.read",
    description: "Read a selected file.",
    permission: "files.read",
    sideEffect: false,
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
  };
  const duplicate = parseDeviceRegistration({
    deviceId: "d1", displayName: "Device", platform: "android",
    capabilities: [capability, capability],
  });
  const permissive = parseDeviceRegistration({
    deviceId: "d1", displayName: "Device", platform: "android",
    capabilities: [{ ...capability, inputSchema: { ...capability.inputSchema, additionalProperties: true } }],
  });
  assert.equal(duplicate.ok, false);
  assert.equal(permissive.ok, false);
});

test("tool job dispatch requires an object payload and bounded identifiers", () => {
  const parsed = parseDeviceJobDispatch({
    deviceId: "android-main",
    toolId: "android.device.battery",
    toolCallId: "call-1",
    arguments: { includeHealth: true },
  });
  assert.equal(parsed.ok, true);
  assert.equal(parseDeviceJobDispatch({ deviceId: "d1", toolId: "bad tool", toolCallId: "x", arguments: {} }).ok, false);
});

test("tool job result accepts only terminal states and bounded JSON", () => {
  const parsed = parseDeviceJobResult({
    jobId: "11111111-1111-4111-8111-111111111111",
    deviceId: "android-main",
    status: "completed",
    result: { level: 84 },
  });
  assert.equal(parsed.ok, true);
  assert.equal(parseDeviceJobResult({
    jobId: "11111111-1111-4111-8111-111111111111",
    deviceId: "android-main",
    status: "claimed",
  }).ok, false);
});

test("device bridge contracts reject unknown top-level fields", () => {
  const jobId = "11111111-1111-4111-8111-111111111111";
  assert.equal(parseDeviceJobDispatch({
    deviceId: "android-main", toolId: "android.device.battery",
    toolCallId: "call-1", arguments: {}, unexpected: true,
  }).ok, false);
  assert.equal(parseDeviceJobResult({
    jobId, deviceId: "android-main", status: "completed", unexpected: true,
  }).ok, false);
  assert.equal(parseDeviceRegistration({
    deviceId: "android-main", displayName: "Device", platform: "android",
    capabilities: [], unexpected: true,
  }).ok, false);
});
