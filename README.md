# Futuristic System — Personal AI Backend & Control Centre

Next.js 15 / TypeScript backend deployed on Render, with Supabase Postgres for persistence and a single-owner access model.

## Personal mode
There is no signup or sign-in. The owner authenticates with a private master token stored only in the Render environment as `FS_OWNER_TOKEN`. The dashboard exchanges it for an HMAC-signed session valid for exactly 96 hours (4 days). The signed session is stored in browser local storage; the master token is never stored in the browser. Reconnect with the master token after expiry. Do not expose or commit either credential.

## Core features
- Pluggable server-side provider adapters (OpenAI-compatible OpenAI and OpenRouter; deterministic mock provider).
- AES-256-GCM encrypted server-side provider credential storage.
- Workflow routing, retryable fallback, request quotas, provider observations.
- AI planner with strict JSON plan validation.
- Allow-listed, bounded, local-only text tools: word count, keyword extraction, text statistics.
- Agent task lifecycle, persisted task history and execution events.
- Personal Control Centre for provider keys and task management.

## API
- `POST /api/v1/owner/session` — exchange owner master token for a signed 4-day session.
- All other private APIs require the signed session in `x-fs-owner-token` or Bearer authorization.
- `GET /api/v1/health` — public service health.
- `GET /api/v1/tools` — tool catalog.
- `GET/POST /api/v1/agent/tasks` — task history and execution.
- `GET /api/v1/agent/tasks/:taskId` — task detail/events.
- `POST /api/v1/ai/generate` — provider-routed generation.
- `GET/PUT/DELETE /api/v1/ai/providers/keys` — encrypted credentials.
- `GET /api/v1/ai/providers/health` — provider readiness/passive metrics.
- `GET /api/v1/ai/usage` — usage status.

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
npm test
npm run build
```

## Explicitly deferred
Web search, YouTube/transcript research, handwritten notes, local GGUF runtime, Android device bridge, phone permissions, multi-user accounts and public release readiness.
