# Futuristic System — Personal AI Backend & MCP Control Centre

Next.js 15 / TypeScript backend deployed on Render, with Supabase Postgres for persistence and a single-owner access model.

## Personal mode

There is no signup or sign-in. The owner authenticates with a private master token stored only in the Render environment as `FS_OWNER_TOKEN`. Private API requests carry this token in `x-fs-owner-token` or `Authorization: Bearer`. The backend verifies it on every request; no four-day signed session is created and the token is not saved in browser storage. Do not expose or commit the credential.

## Core features

- Pluggable server-side provider adapters (OpenAI-compatible OpenAI and OpenRouter; deterministic mock provider).
- AES-256-GCM encrypted server-side provider credential storage.
- Workflow routing, retryable fallback, request quotas, provider observations.
- AI planner with strict JSON plan validation.
- Allow-listed text tools, persistent memory search/store and device-tool dispatch.
- Stateless Streamable HTTP MCP endpoint with tools, resources and prompts.
- Agent task lifecycle, persisted task history and execution events.
- Personal MCP Command Centre for provider keys, workflow routing, tool discovery, memory and device management.

## API

- `POST /api/mcp` — MCP Streamable HTTP JSON-RPC endpoint.
- `GET /api/v1/health` — public service health.
- `GET /api/v1/tools` — authenticated tool catalog.
- `GET/POST /api/v1/agent/tasks` — task history and execution.\n- `GET /api/v1/agent/tasks/:taskId` — task detail, events and remote tool jobs.
- `GET /api/v1/agent/tasks/:taskId` — task detail/events.
- `POST /api/v1/ai/generate` — provider-routed generation.
- `GET/PUT/DELETE /api/v1/ai/providers/keys` — encrypted credentials.
- `GET /api/v1/ai/providers/health` — provider readiness/passive metrics.
- `GET /api/v1/ai/usage` — usage status.\n- `GET/POST/DELETE /api/v1/memory` — owner-scoped persistent memory.\n- `GET/POST/DELETE /api/v1/devices` — device registration and status.\n- `POST /api/v1/devices/jobs` — queue a remote device tool.\n- `POST /api/v1/devices/jobs/claim` — claim queued jobs.\n- `POST /api/v1/devices/jobs/result` — submit device execution results.\n- `GET/PUT/DELETE /api/v1/ai/policies` — per-workflow model routing.

### MCP connection

- Endpoint: `https://mcp-backend-2oyj.onrender.com/api/mcp`
- Method: `POST`
- Content-Type: `application/json`
- Accept: `application/json, text/event-stream`
- Authorization: `Bearer <FS_OWNER_TOKEN>`
- After `initialize`, send `MCP-Protocol-Version: 2026-07-28` on subsequent requests.
- The endpoint is stateless and responds with JSON; it does not issue MCP session IDs.

Supported methods: `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`.

Current tools: `text.word_count`, `text.extract_keywords`, `text.text_stats`, `memory.search`, `memory.store`, `device.list`, `device.dispatch_tool`, `agent.submit_task`, `agent.task_status`.

## Server environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server only)
- `AI_PROVIDER_ENCRYPTION_KEY` (32-byte base64 key; keep stable for decryption)
- `FS_OWNER_TOKEN` (at least 32 random characters; server-only master credential)

Never prefix secrets with `NEXT_PUBLIC_`. Never commit real keys or tokens.

## Development checks

```bash
npm run typecheck
npm run test
npm run build
```

Android integration contract: see [docs/android-device-bridge.md](docs/android-device-bridge.md) for registration, tool schemas, job polling, result callbacks and the local permission boundary.\n\n## Explicitly deferred

Web search, YouTube/transcript research, handwritten notes, local GGUF runtime, automatic agent-to-device task continuation, phone permissions and public release readiness.
