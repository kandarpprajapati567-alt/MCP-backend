# Phase 2 — AI Core Architecture

**Status:** In progress. Provider foundation and encrypted credential storage are implemented; initial workflow routing files exist. Agent execution, persistence, and end-to-end verification remain pending.
**Scope:** Add an extensible AI-agent backend to the existing Next.js 15 + TypeScript + Supabase application without changing Phase 1 authentication/profile behavior or the Android application.

## 1. Goals

1. Support multiple AI providers through a common server-side adapter contract.
2. Keep provider credentials encrypted/server-only and never expose them to browser code.
3. Route workflows to configured providers/models without hard-coding one vendor.
4. Execute agent tasks through a plan → permission check → tool execution → synthesis pipeline.
5. Persist task state and safe execution events so clients can show progress and recover from failures.
6. Keep every capability independently testable and replaceable.

## 2. Non-goals for this phase

- Web search, YouTube/transcript research, handwritten notes generation.
- Device pairing, Android remote control, or autonomous filmmaking.
- Arbitrary shell/code execution or unrestricted third-party MCP servers.
- Storing provider secrets in browser storage, profile rows, or NEXT_PUBLIC environment variables.
- Claiming local GGUF inference before a supported runtime and host capacity are selected.

## 3. Target server architecture

```text
Authenticated client
  └─ /api/v1/agent/tasks
       └─ Task service (ownership, validation, idempotency)
            ├─ Task repository (Supabase, user-scoped RLS)
            ├─ Workflow router (task type → model policy)
            └─ Agent orchestrator
                 ├─ Planner adapter
                 ├─ Permission gate
                 ├─ Tool registry + validated tool schemas
                 ├─ Tool executor (allow-listed tools only)
                 └─ Result synthesizer
                      └─ Task events / final result
```

Provider adapters implement a narrow interface (capability metadata, model listing where supported, structured generation, timeout and normalized errors). Vendor SDKs must remain behind server-only adapters. Start with an OpenAI-compatible HTTP adapter; add vendor-specific adapters only when required.

## 4. Proposed module boundaries

- `src/server/ai/providers/`: provider adapter contract and implementations.
- `src/server/ai/routing/`: workflow/model policy and fallback selection.
- `src/server/agent/`: planner, orchestrator, permission gate, synthesizer.
- `src/server/tools/`: typed registry, schemas, safe executor.
- `src/server/tasks/`: task service, persistence, state transitions.
- `src/app/api/v1/ai/`: authenticated provider/configuration APIs (never return secrets).
- `src/app/api/v1/agent/`: authenticated task APIs.
- `src/types/`: shared non-secret API contracts only.

All credential-bearing modules must import `server-only`. Route handlers must validate input, authenticate via the existing cookie-backed Supabase server client, enforce ownership, return no-store responses, and normalize errors.

## 5. Data model proposal (not yet migrated)

- `ai_provider_configs`: user-owned provider label, provider type, base URL, enabled flag, safe metadata; never plaintext API keys.
- `ai_provider_secrets`: encrypted credential payload, key version, timestamps; access only through server-side secret service. Encryption key lives in Vercel server environment, never in the database or client.
- `ai_model_policies`: user/workspace workflow mapping to provider/model and fallback policy.
- `agent_tasks`: owner, task type, status, safe input summary, result, error code, timestamps, idempotency key.
- `agent_task_events`: owner/task reference, sequence, event type, safe payload, timestamp.

Every user-owned table requires RLS and ownership predicates. Secret table access should be denied to anon/authenticated roles; server-only access must use a narrowly scoped privileged path and must not expose secret values in APIs or logs. Decide whether secrets belong in a managed secrets vault instead of Postgres before implementation.

## 6. Task lifecycle

`queued → planning → awaiting_approval (when required) → executing → synthesizing → completed`

Terminal alternatives: `failed`, `cancelled`. State transitions must be validated server-side. Each tool call has a registered ID, JSON schema, permission requirement, timeout, bounded output, and audit event. No arbitrary eval, shell, filesystem, or unrestricted network tool.

## 7. Security requirements

- Authenticate every task/provider route and scope every read/write to the authenticated user.
- Never trust user-editable metadata for authorization.
- Keep provider secrets out of responses, logs, analytics, and client bundles.
- Validate provider URLs (HTTPS; block loopback, link-local, private-network and metadata-service targets) to prevent SSRF.
- Enforce request size, per-user rate limits, timeouts, output limits and task quotas.
- Require explicit approval for sensitive or external side-effect tools.
- Treat model output and tool output as untrusted data; validate structured plans against schemas and allow-lists.
- Use idempotency keys and safe retries; never automatically retry non-idempotent side effects.
- Apply RLS to all exposed public-schema tables and run Supabase security advisors after migrations.

## 8. Implementation sequence

1. **2.1 Architecture contract:** freeze module boundaries, API shapes, task states, security model.
2. **2.2 Provider foundation:** typed adapter contract + mock provider + health/test endpoint.
3. **2.3 Secret management:** choose vault/encryption design; implement write/read/test without returning secrets.
4. **2.4 Model routing:** workflow policies, capability checks, deterministic fallback.
5. **2.5 Agent planner:** schema-validated plans, no tool execution yet.
6. **2.6 Tool registry and permissions:** allow-listed tools and approval gates.
7. **2.7 Executor and synthesizer:** bounded execution and evidence-linked result.
8. **2.8 Task persistence/events:** safe progress, retry/cancel and history.
9. **2.9 UI integration:** provider settings and task console.
10. **2.10 Verification:** unit/integration/security tests, typecheck, build, deployment smoke test.

## 9. Acceptance gates

- Phase 1 login, email verification, profile read/update continue to work unchanged.
- No provider secret appears in browser bundles, API responses, or logs.
- Unauthenticated users cannot access provider or task APIs.
- User A cannot read or mutate User B's provider configs, tasks, or events.
- Invalid plans and unregistered tools are rejected.
- Provider timeout/invalid credentials produce normalized safe errors.
- Task state transitions and retries are deterministic and tested.
- Supabase RLS/security advisors, TypeScript checks, build, and deployment smoke tests pass.

## 10. Current implementation snapshot

- Provider contract and deterministic mock adapter exist under `src/server/ai/providers/`.
- Authenticated mock provider health endpoint exists at `GET /api/v1/ai/providers/health`.
- Encrypted provider credential storage exists under `src/server/ai/secrets/` and `/api/v1/ai/providers/keys`. Save/list verification is not equivalent to successful decryption and live vendor generation.
- Initial workflow policies and a capability-aware route resolver exist under `src/server/ai/routing/`. These currently default to the mock provider; real provider execution, retry behavior, and automated tests remain pending.

## 11. Next implementation sequence

1. Verify routing with deterministic automated tests and TypeScript/build checks.
2. Connect the selected route to a server-only provider execution service.
3. Implement and validate the agent planner without executing tools.
4. Add the allow-listed tool registry and permission gates.
5. Add bounded execution and result synthesis.
6. Persist task lifecycle and safe events with ownership/RLS.
7. Connect the Control Centre and then the Android app through authenticated, versioned APIs.

Do not expose real provider credentials to client code. Do not add arbitrary provider URLs, shell execution, eval, or unrestricted network tools. Keep the Android application as the authority for Android device permissions.
