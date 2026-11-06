# Phase 2 — AI Core Architecture

**Deployment mode:** Single owner, no signup/sign-in. A server-only owner master token (`FS_OWNER_TOKEN`) is exchanged for an HMAC-signed owner session with a 96-hour (4-day) expiry. The master token is never stored in browser storage. Session signatures and expiry are verified by every private API route.

## Core foundations
- Provider adapters, encrypted credentials, capability-aware workflow routing, fallback, usage limits and passive observations.
- Strict planner schema and bounded plan validation.
- Single-owner session security with HMAC-SHA256, constant-time signature comparison and origin checks.
- Supabase task/event persistence and allow-listed local-only text tools.
- Agent lifecycle: `queued → planning → executing → synthesizing → completed`; failures become `failed`.
- Personal Control Centre with task execution/history and encrypted provider-key management.

## API
- `POST /api/v1/owner/session` — exchange master token for a signed 4-day session.
- `GET /api/v1/tools` — private tool catalog.
- `GET/POST /api/v1/agent/tasks` — task history and execution.
- `GET /api/v1/agent/tasks/:taskId` — task and event detail.
- `POST /api/v1/ai/generate` — provider-routed generation.
- `GET /api/v1/ai/providers/keys`, `PUT`, `DELETE` — encrypted credentials.
- `GET /api/v1/ai/providers/health` — passive readiness/observations.
- `GET /api/v1/ai/usage` — usage status.

## Deferred
Web search, YouTube/transcript research, handwritten notes, local GGUF hosting, Android device bridge/pairing, camera/microphone/filesystem access, autonomous filmmaking and multi-user publishing.

## Verification
Typecheck, unit tests, production build, session issuance and expiry tests, unauthenticated denial, owner session success, task persistence, tool rejection and Supabase security review.
