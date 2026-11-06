# Futuristic System — Personal AI Backend & Control Centre

Next.js 15 / TypeScript backend deployed on Render, with Supabase Postgres for persistence and a single-owner access model. This is a companion backend; it does not directly control Android hardware.

## Personal mode
There is no signup or sign-in in this development phase. Private API requests require the server-only `FS_OWNER_TOKEN` via `x-fs-owner-token` (or Bearer authorization). The web Control Centre stores the token in tab-scoped session storage only. Do not expose or commit this token.

## Core features
- Pluggable server-side provider adapters (OpenAI-compatible OpenAI and OpenRouter; deterministic mock provider).
- AES-256-GCM encrypted provider credential storage.
- Workflow routing, retryable fallback, request quotas, provider observations.
- AI planner with strict JSON plan validation.
- Allow-listed, bounded, local-only text tools: word count, keyword extraction, text statistics.
- Agent task lifecycle, persisted task history and execution events.
- Personal Control Centre for provider keys and task management.

## API
All private routes require the owner token.
- `GET /api/v1/health` — public health status.
- `GET /api/v1/tools` — tool catalog.
- `GET/POST /api/v1/agent/tasks` — task history and execution.
- `GET /api/v1/agent/tasks/:taskId` — task detail/events.
- `POST /api/v1/ai/generate` — provider-routed AI generation.
- `GET/PUT/DELETE /api/v1/ai/providers/keys` — encrypted credentials.
- `GET /api/v1/ai/providers/health` — readiness and passive provider metrics.
- `GET /api/v1/ai/usage` — usage status.

Example:
```http
POST /api/v1/agent/tasks
x-fs-owner-token: <FS_OWNER_TOKEN>
Content-Type: application/json

{"task":"Count words in this text: Futuristic System backend"}
```

## Server environment
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server only)
- `AI_PROVIDER_ENCRYPTION_KEY` (32-byte base64 key; keep stable for decryption)
- `FS_OWNER_TOKEN` (at least 32 random characters; keep secret)

Never prefix secrets with `NEXT_PUBLIC_`. Never commit real keys or tokens.

## Development checks
```bash
npm run typecheck
npm test
npm run build
```

## Explicitly deferred
Web search, YouTube/transcript research, handwritten notes, local GGUF runtime, Android device bridge, phone permissions, multi-user accounts and public release readiness. These require separate design and verification.
