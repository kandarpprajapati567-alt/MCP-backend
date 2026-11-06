# Futuristic System — AI Backend & Control Centre

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org/) [![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3FCF8E?logo=supabase)](https://supabase.com/) [![Deployment](https://img.shields.io/badge/Deployment-Vercel-black?logo=vercel)](https://vercel.com/)

**Futuristic System** is an AI-powered personal computing platform. This repository contains the server-side backend and web-based Control Centre. It works alongside a separate Android application; it does not replace the app or directly control the phone.

> **Development status:** Authenticated AI generation, encrypted per-user provider credentials, runtime OpenAI/OpenRouter registry, retryable fallback, distributed per-user quotas, and provider-readiness diagnostics are implemented. CI verifies typecheck, provider/routing/quota tests, and production build. Live vendor credentials/connectivity, full agent orchestration, and Android integration still require separate acceptance testing.

## Architecture

```text
Android App
  - User interface
  - Android permissions and device actions
  - Local file creation / saving
          | authenticated, versioned API
          v
Futuristic System Backend
  - Authentication and ownership checks
  - AI provider credentials and model routing
  - Planner, tool permissions, executor
  - Tasks, events, and result synthesis
       |                         |
       v                         v
Supabase                   AI Providers
(Auth + Postgres)          (server-side adapters)

Web Control Centre
  - Backend configuration and monitoring
  - Separate from the Android app
```

### Responsibility boundary
- **Android app:** owns phone-side permissions and local actions involving files, camera, microphone, and other device capabilities.
- **Backend:** authenticates requests and orchestrates AI workflows, provider calls, registered tools, and task execution.
- **Control Centre:** provides web-based backend configuration and monitoring.
- **Supabase:** provides authentication and persistent data.
- **AI providers:** inference services accessed through server-side adapters.

The backend must not claim direct access to a user's phone files, camera, or microphone. Such capabilities require an explicit, authenticated Android-side bridge and user permission.

## Design and security principles
1. Never expose provider credentials, encryption keys, or privileged database access to browser code or API responses.
2. Enforce authentication, user ownership, Row Level Security, allow-listed providers/tools, and explicit permission gates.
3. Keep provider integrations behind a shared adapter contract.
4. Treat model output as untrusted input; validate plans and tool arguments before execution.
5. Use mock providers for development and tests. Do not add arbitrary shell, `eval`, unrestricted filesystem, or unrestricted network tools.
6. Keep application APIs versioned under `/api/v1`.
7. Keep secrets out of logs, commits, issues, and client-visible errors.

## Technology
- Next.js 15 / React 19
- TypeScript
- Supabase Auth and Postgres
- Vercel
- Node.js (use Node 22 or later for the current Supabase dependency set)

## Local development

### Requirements
- Node.js 22+
- npm
- A Supabase project configured for this application

### Setup
```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Public | Canonical application URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase publishable key |
| `SUPABASE_SECRET_KEY` | Server only | Privileged server-side Supabase operations |
| `AI_PROVIDER_ENCRYPTION_KEY` | Server only | AES-256-GCM encryption key for stored provider credentials |

Never commit `.env.local` or real credentials. Never prefix a secret with `NEXT_PUBLIC_`. Keep `AI_PROVIDER_ENCRYPTION_KEY` stable: changing it without a planned key-rotation and re-encryption process makes existing stored credentials unreadable. Refer to `.env.example` for the expected configuration.

## Implemented API surface

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Backend/database health |
| POST | `/api/v1/auth/signup` | Registration |
| POST | `/api/v1/auth/login` | Sign in |
| POST | `/api/v1/auth/logout` | Sign out |
| GET | `/api/v1/auth/me` | Validate current session |
| GET | `/api/v1/profile` | Read caller profile |
| PATCH | `/api/v1/profile` | Update caller profile |
| GET | `/api/v1/ai/providers/health` | Authenticated provider configuration/readiness check (no vendor call) |
| POST | `/api/v1/ai/generate` | Authenticated workflow generation with server-side provider routing and quotas |
| GET / PUT / DELETE | `/api/v1/ai/providers/keys` | List metadata, save encrypted key, or delete key |

The provider health endpoint reports which adapters are configured and ready to be selected; it does not prove vendor network connectivity and does not spend provider credits. The provider-key endpoints store encrypted credentials and return metadata; they never expose plaintext keys. The generation endpoint accepts only allow-listed workflows and validated messages; provider/model selection stays server-side.

## AI execution foundation

- Shared provider contract and deterministic mock provider.
- Workflow policies and capability-aware model routing.
- Retryable fallback execution; non-retryable errors stop fallback.
- AES-256-GCM encrypted provider credential storage.
- Server-only provider credential loader.
- Initial OpenAI-compatible Chat Completions adapter for OpenAI and OpenRouter, with fixed endpoints, bounded input, timeout handling, and normalized errors.
- Request-scoped runtime registry loads only the authenticated user's encrypted OpenAI/OpenRouter credentials.
- Authenticated generation endpoint with allow-listed workflows, server-side model selection, and retryable fallback.
- Atomic Postgres quota reservation: 10 requests/minute, 200 requests/day, and 2,000,000 input characters/day per user. Rejected requests receive HTTP 429 and `Retry-After`.
- Output-token usage is recorded after successful generation when the provider returns token usage metadata.
- Provider readiness diagnostics report configured adapters without contacting vendors or consuming credits.

**Not yet complete:** live vendor verification with user-configured credentials; provider connectivity/latency monitoring; planner, validated tool registry/permission gates, result synthesizer, task persistence/events, and Android device bridge.

## Roadmap

- [x] Engineering baseline and project structure
- [x] Supabase SSR authentication, profile API, and health foundation
- [x] Provider contract and mock foundation
- [x] Encrypted provider credential storage foundation
- [x] Capability-aware workflow/model routing and fallback foundation
- [x] Bounded, provider-agnostic executor foundation
- [x] Initial OpenAI/OpenRouter-compatible adapter implementation
- [x] Provider adapter regression tests (including timeout and outage normalization)
- [x] Runtime provider registry and authenticated generation API
- [x] Distributed per-user request and input-usage quotas
- [x] Provider configuration/readiness diagnostics
- [ ] Live-provider verification with user-configured credentials
- [ ] Schema-validated AI planner
- [ ] Allow-listed tool registry and permission gates
- [ ] Result synthesizer
- [ ] Task persistence, lifecycle, and events
- [ ] Full Control Centre integration
- [ ] Android app integration and secure device capability bridge
- [ ] Provider connectivity and latency monitoring
- [ ] Production security, CI, and deployment verification
- [ ] Public release readiness (including an explicit open-source license)

A checked item means implementation exists; it does not imply every production acceptance test has passed. See `docs/PHASE-2-ARCHITECTURE.md` for the architecture contract.

## Quality checks

```bash
npm run typecheck
npm test
npm run build
```

Run these checks before proposing or merging changes. A CI run must be confirmed successful for the exact commit before describing that commit as verified.

## Security reporting

See [SECURITY.md](SECURITY.md) for responsible vulnerability disclosure. Do not include API keys, encryption keys, access tokens, or personal data in issues or pull requests.

## Contributing

Contributions must preserve the Android/backend boundary, server-only secret handling, API versioning, least-privilege execution, and test coverage. Discuss substantial architectural changes before submitting a pull request.

## License

No open-source license has been selected yet. Public repository visibility does not itself grant permission to reuse, redistribute, or create derivative works. Add an explicit license before presenting this repository as open source or accepting external contributions under open-source terms.
