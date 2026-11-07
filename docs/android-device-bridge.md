# Android Device Bridge Contract

This contract is implemented by the MCP backend. The Android app can be connected later without changing the server-side task model.

## Identity and security boundary

- Current private API requests use the owner master token in Authorization: Bearer FS_OWNER_TOKEN or x-fs-owner-token.
- **Do not hardcode FS_OWNER_TOKEN into the Android APK.** It is a temporary owner-only integration credential.
- Before a real Android connection, add a device-pairing exchange that issues a device-scoped credential and can revoke one device independently.
- The backend only queues tool requests. It does not directly access Android files, camera, sensors, apps or permissions.
- Android must check the local permission and any required user consent immediately before execution.

## 1. Register a device

POST /api/v1/devices

    {
      "deviceId": "vivo-y51a-main",
      "displayName": "Futuristic System Android",
      "platform": "android",
      "appVersion": "0.2.0",
      "capabilities": [
        {
          "id": "android.device.battery",
          "description": "Read battery status and health.",
          "permission": "device.read_battery",
          "sideEffect": false,
          "inputSchema": {
            "type": "object",
            "properties": {
              "includeHealth": { "type": "boolean" }
            },
            "required": [],
            "additionalProperties": false
          }
        }
      ]
    }

Rules:
- Android tool IDs must start with android.; Windows tools must start with windows.
- At most 100 capabilities per device and 32 properties per capability. Input properties use bounded string, number, integer or boolean types.
- Capability metadata contains schemas only; it never contains executable code.
- Re-registering the same owner/device ID updates its display name, version and capabilities.

## 2. Poll and claim work

POST /api/v1/devices/jobs/claim

    { "deviceId": "vivo-y51a-main", "limit": 5 }

The backend atomically claims up to 10 queued jobs for that device. A job left claimed for more than five minutes can be reclaimed; clients should deduplicate by jobId. The response contains job IDs, tool IDs, arguments and status. The Android client must:
1. Find the tool in its own local allow-listed registry.
2. Validate arguments against its local schema.
3. Check local permission and user consent.
4. Execute locally.
5. Submit a bounded result.

## 3. Return a result

POST /api/v1/devices/jobs/result

    {
      "jobId": "11111111-1111-4111-8111-111111111111",
      "deviceId": "vivo-y51a-main",
      "status": "completed",
      "result": { "batteryPercent": 84, "charging": false }
    }

For failures, use status: failed and a short errorCode. Results are limited to 32 KB. Only the device that owns a claimed job can complete it.

When every job for an agent task reaches a terminal state, the backend resumes synthesis and changes the task from waiting_for_device to completed.

## 4. MCP discovery and dispatch

MCP endpoint: POST /api/mcp

- tools/list includes agent.submit_task, agent.task_status, device.list and device.dispatch_tool.
- device.list returns registered devices and capabilities.
- device.dispatch_tool queues a validated device tool job.\n- agent.submit_task runs the full planner → tools → synthesis pipeline.\n- agent.task_status returns the task, event timeline and device job state.
- The planner may also select an advertised android.* or windows.* capability directly when that device has checked in within the last five minutes.

## Current limitations

- Device pairing tokens are not implemented yet; the master token must not be embedded in an APK.
- The Android app has not been connected or runtime-tested against this contract yet.
- The backend queues and tracks remote jobs; device-side permission UI and execution are the Android app's responsibility.
