# Futuristic System — Personal AI Backend & MCP Server

A Next.js 15 / TypeScript backend for the Futuristic System Android app. It provides a remote AI orchestration layer, MCP tools, persistent memory, model routing, and a device-job bridge. Supabase Postgres stores application data.

## Deployment layout

### Production backend — Render

- Service: `MCP-backend`
- URL: https://mcp-backend-2oyj.onrender.com
- Repository: `kandarpprajapati567-alt/MCP-backend`
- Production branch: `main`
- Auto-deploy: enabled on new commits
- Runtime: Node.js, Next.js
- Build: `npm install && npm run build`
- Start: `npm run start`

Render is the current production API host. Changes on `backend-foundation` are not production until merged into `main`.

### Vercel — preview projects

Two Vercel projects are linked to this same repository: `mcp-backend` and `futuristic-mcp-backend`. They are preview/test deployments, not the production API source of truth. Their deployments currently have SSO protection enabled; do not use a protected preview URL as the Android app's production base URL.

## Personal owner mode

- No signup, login page, or four-day owner session is required.
- Private API requests are authenticated with the owner master token using `x-fs-owner-token` or `Authorization: Bearer <FS_OWNER_TOKEN>`.
- The master token is stored server-side as `FS_OWNER_TOKEN`; never commit it or hardcode it into the Android APK.
- A device-scoped pairing/token exchange is a separate future integration step. The Android app must use its own revocable device credential before production connection.
- The backend queues Android/Windows tool requests; it cannot directly read phone files, camera, sensors, apps, or permissions. The device must validate the tool, request local permission/consent, execute locally, and return a bounded result.

## Capabilities

- MCP Streamable HTTP endpoint with JSON-RPC tools, resources, and prompts.
- Provider adapters: OpenAI-compatible OpenAI, OpenRouter, and deterministic mock.
- Per-workflow provider/model routing with retryable fallback.
- Encrypted provider-key storage using AES-256-GCM.
- Usage limits and provider health/observability.
- AI task planner with strict plan and tool-argument validation.
- Allow-listed backend tools and persistent owner memory.
- Device registration, capability discovery, queued tool jobs, and result callbacks.
- Agent task status, event history, and result synthesis.
- Personal MCP Command Centre for provider keys, workflow routing, tools, memory, and devices.

## API reference

All private endpoints require the owner token unless explicitly marked public.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/mcp` | Stateless MCP Streamable HTTP JSON-RPC |
| GET | `/api/v1/health` | Public service health |
| GET | `/api/v1/tools` | Registered tool catalog |
| GET, POST | `/api/v1/agent/tasks` | List tasks / submit a task |
| GET | `/api/v1/agent/tasks/:taskId` | Task, events, and remote jobs |
| POST | `/api/v1/ai/generate` | Provider-routed text generation |
| GET, PUT, DELETE | `/api/v1/ai/providers/keys` | Manage encrypted provider credentials |
| GET | `/api/v1/ai/providers/health` | Provider readiness and health metrics |
| POST | `/api/v1/ai/providers/mock/test` | Test mock provider |
| GET | `/api/v1/ai/usage` | Usage status and limits |
| GET, PUT, DELETE | `/api/v1/ai/policies` | Per-workflow model policies |
| GET, POST, DELETE | `/api/v1/memory` | Search, store, and delete owner memory |
| GET, POST, DELETE | `/api/v1/devices` | List, register/update, and remove devices |
| POST | `/api/v1/devices/jobs` | Queue a device tool job |
| POST | `/api/v1/devices/jobs/claim` | Device claims queued jobs |
| POST | `/api/v1/devices/jobs/result` | Device submits execution result |
| GET | `/api/v1/profile` | Read owner profile |
| PATCH | `/api/v1/profile` | Update owner profile |

### MCP connection

- Endpoint: `https://mcp-backend-2oyj.onrender.com/api/mcp`
- Method: `POST`
- Content-Type: `application/json`
- Accept: `application/json, text/event-stream`
- Authorization: `Bearer <FS_OWNER_TOKEN>`
- The endpoint is stateless; it does not issue MCP session IDs.

Supported protocol methods: `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, and `prompts/get`.

Registered tools:

- `text.word_count`
- `text.extract_keywords`
- `text.text_stats`
- `memory.search`
- `memory.store`
- `device.list`
- `device.dispatch_tool`
- `agent.submit_task`
- `agent.task_status`

## Android device bridge

See [docs/android-device-bridge.md](docs/android-device-bridge.md) for the device registration payload, capability schemas, job polling/claiming, result callbacks, and permission boundary.

Important: the backend contract is implemented, but the Android app has not yet been connected and runtime-tested against it. Do not put the owner master token in the APK. Device pairing and revocable device credentials are still required before app integration.

## Environment variables

Copy `.env.example` and configure these on the server:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` — server only
- `AI_PROVIDER_ENCRYPTION_KEY` — stable 32-byte base64 key; required to decrypt stored provider keys
- `FS_OWNER_TOKEN` — long random owner master token; server only

Never prefix secrets with `NEXT_PUBLIC_`. Never commit real keys or tokens.

## Local development

Requirements: Node.js 22 or later.

```bash
npm install
npm run dev
```

Validation commands:

```bash
npm run typecheck
npm run test
npm run build
```

GitHub Actions runs typecheck, tests, and a production build. The `backend-foundation` branch is the integration/development branch; `main` is the Render production branch.

## Not implemented yet

- Android app connection and on-device runtime validation.
- Device pairing and revocable per-device credentials.
- Web search and YouTube/transcript research.
- Local GGUF model runtime.
- Handwritten-notes generation pipeline.
- Public multi-user release and signup.
