# Phase 2 — AI Core Architecture

**Implementation status:** Core personal-mode backend implementation in progress; final runtime testing remains a separate gate.
**Deployment mode:** Single owner, no signup/sign-in. All private APIs require the high-entropy `FS_OWNER_TOKEN` in `x-fs-owner-token` or Bearer authorization. The stable internal owner UUID is server-only and never supplied by clients.

## Completed foundations
- Shared provider adapter contract, deterministic mock adapter, OpenAI-compatible OpenAI/OpenRouter adapters.
- AES-256-GCM encrypted server-side provider credentials.
- Capability-aware workflow routing, retryable fallback, usage limits, passive provider observations.
- Strict planner schema and bounded plan validation.
- Personal owner-token authentication helper with constant-time comparison and same-origin browser checks.
- Supabase task and task-event persistence, with RLS enabled and direct anon/authenticated grants revoked.
- Allow-listed local tools: word count, keyword extraction, and text statistics. Each tool validates its arguments and has no external side effects.
- Task API: create, plan, execute registered tools, synthesize, persist lifecycle/events, list history, fetch task detail.
- Personal Control Centre: owner-token session, task execution/history, encrypted provider-key management.

## Agent lifecycle
`queued → planning → executing → synthesizing → completed`; failures become `failed`. Planner output is untrusted and must pass strict schema validation. The executor accepts only registered tool IDs and bounded text arguments. No shell, eval, arbitrary filesystem, unrestricted network, or third-party MCP execution is exposed.

## API
- `GET /api/v1/health` — public service status only.
- `GET /api/v1/tools` — private tool catalog.
- `GET/POST /api/v1/agent/tasks` — private task history and task execution.
- `GET /api/v1/agent/tasks/:taskId` — task and event detail.
- `POST /api/v1/ai/generate` — provider-routed generation.
- `GET /api/v1/ai/providers/keys`, `PUT`, `DELETE` — encrypted provider credential management.
- `GET /api/v1/ai/providers/health` — readiness and passive observations; does not actively call vendors.
- `GET /api/v1/ai/usage` — private usage status.

## Deferred beyond Phase 2
Web search, YouTube/transcript research, handwritten notes, local GGUF hosting, Android device bridge/pairing, camera/microphone/filesystem access, autonomous filmmaking, multi-user publishing and signup/sign-in. Android remains authoritative for phone-side permissions.

## Required final verification
Typecheck, unit tests, production build, deploy smoke tests, unauthenticated denial, owner-token success, task persistence/event order, invalid-plan/tool rejection, provider secret redaction, and Supabase RLS/security advisor review.
