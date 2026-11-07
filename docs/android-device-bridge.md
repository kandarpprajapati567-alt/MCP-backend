# Android Device Bridge Contract

This contract lets Futuristic System coordinate local Android work without granting the backend direct access to phone data or permissions.

## Security boundary

- The owner master token stays on the server and must never be embedded in the APK.
- Pairing is initiated by an owner-authenticated request and produces a short-lived, single-use pairing code (5 minutes).
- The device exchanges that code once and receives a random device-scoped bearer token.
- Only a SHA-256 hash of the pairing code and device token is persisted. Plaintext device tokens are returned once.
- A device token can access only its own registration update, job-claim and result-callback routes. It cannot call owner APIs or act as another device.
- Owner-side device deletion/revocation invalidates all active credentials for that device.
- Device tokens should be stored using Android Keystore-backed encrypted storage. Do not log them or include them in analytics/crash reports.
- Android checks its local allow-list, permissions and user consent immediately before executing any device-side action.

The backend only queues and tracks work. It does not directly access Android files, camera, sensors, apps or permissions.

## 1. Start pairing (owner only)

POST /api/v1/devices/pairing

Authorization: Bearer <FS_OWNER_TOKEN>

No request body is required.

Response (201):

    {
      "ok": true,
      "pairingCode": "<one-time-secret>",
      "expiresAt": "<ISO-8601>",
      "expiresInSeconds": 300
    }

Show the code as a QR code or transfer it over a trusted local channel. Do not put it in logs or public URLs. Generate a fresh code if it expires. The backend stores only its SHA-256 hash.

## 2. Claim pairing (device, no owner token)

POST /api/v1/devices/pairing/claim

The device submits the code together with its registration manifest:

    {
      "pairingCode": "<one-time-secret>",
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

Response (201):

    {
      "ok": true,
      "device": { "deviceId": "vivo-y51a-main", "status": "online" },
      "deviceToken": "fsd_<one-time-secret>",
      "tokenType": "Bearer"
    }

The device token is shown only once. Store it securely using Android Keystore-backed encrypted storage. If the response is lost, revoke/re-pair the device; the server cannot recover the plaintext token.

Pairing codes expire after five minutes and are single-use. Invalid, expired or consumed codes are rejected. A new successful pairing replaces previous active credentials for that same device ID.

## 3. Refresh registration (device scoped)

PUT /api/v1/devices

Authorization: Bearer <deviceToken>

The request uses the same registration shape as the claim request, without pairingCode. The authenticated device ID must match the body deviceId. This updates only that device's display name, app version and capability manifest.

Owner-only administration:
- GET /api/v1/devices lists devices.
- POST /api/v1/devices performs trusted owner-side registration.
- DELETE /api/v1/devices with {"deviceId":"..."} revokes all credentials for that device and marks it offline.

## 4. Poll and claim work (device scoped)

POST /api/v1/devices/jobs/claim

Authorization: Bearer <deviceToken>

    { "deviceId": "vivo-y51a-main", "limit": 5 }

The authenticated device ID must match deviceId. The backend atomically claims up to 10 queued jobs. A job left claimed for more than five minutes can be reclaimed; clients should deduplicate by jobId. The Android client must:
1. Find the tool in its own local allow-listed registry.
2. Validate arguments against its local schema.
3. Check local permission and user consent.
4. Execute locally.
5. Submit a bounded result.

## 5. Return a result (device scoped)

POST /api/v1/devices/jobs/result

Authorization: Bearer <deviceToken>

    {
      "jobId": "11111111-1111-4111-8111-111111111111",
      "deviceId": "vivo-y51a-main",
      "status": "completed",
      "result": { "batteryPercent": 84, "charging": false }
    }

For failures, use status: failed and a short errorCode. Results are limited to 32 KB. Only the authenticated device that owns a claimed job can complete it.

When every job for an agent task reaches a terminal state, the backend resumes synthesis and changes the task from waiting_for_device to completed.

## 6. MCP discovery and dispatch (owner only)

MCP endpoint: POST /api/mcp

- tools/list includes agent.submit_task, agent.task_status, device.list and device.dispatch_tool.
- device.list returns registered devices and capabilities.
- device.dispatch_tool queues a validated device tool job.
- agent.submit_task runs the full planner → tools → synthesis pipeline.
- agent.task_status returns the task, event timeline and device job state.
- The planner may select an advertised android.* or windows.* capability directly when that device has checked in within the last five minutes.

## Remaining integration work

- The backend pairing and device-authentication endpoints are implemented on the development branch; apply the matching Supabase migration before deployment.
- The Android app has not yet been connected or runtime-tested against this contract.
- Android-side QR scanning/display, Keystore token storage, background polling, reconnect behavior, local permission UI and execution remain to be implemented and tested.
