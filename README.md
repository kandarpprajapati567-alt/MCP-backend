# Futuristic System — AI Backend & Control Centre

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org/) [![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3FCF8E?logo=supabase)](https://supabase.com/) [![Vercel](https://img.shields.io/badge/Deployment-Vercel-black?logo=vercel)](https://vercel.com/)

**Futuristic System** is an AI-powered personal computing platform. This repository contains its server-side backend and web-based Control Centre. It is designed to work with the separate Android application, not replace it.

> Status: active development. Authentication and initial provider/secret foundations exist. Agent execution and Android device integration are still under development.

## Platform architecture

```text
Android App (user interface, local device permissions, local capabilities)
                 | authenticated, versioned API
                 v
Backend (authentication, AI orchestration, routing, planner, tool permissions,
         executor, tasks, events, results)
          |                         |
          v                         v
Supabase (Auth + Postgres)     AI Providers (OpenAI, Anthropic, Google, etc.)

Web Control Centre: configure and monitor the backend; not the Android app.
```

### Component responsibilities
- **Android application:** primary user experience and authority for Android-specific permissions and local device actions.
- **Backend:** trusted orchestration layer for authentication, AI workflows, provider access, tool authorization, and task execution.
- **Web Control Centre:** configuration and monitoring interface; it is not the Android app.
- **Supabase:** authentication and persistent application data.
- **AI providers:** replaceable inference services accessed only through server-side adapters.

The backend must never assume it can access a phone's files, camera, microphone, or other device capabilities without explicit app-side permission and a secure integration.

## Design principles
1. Server-side secrets never enter browser bundles or API responses.
2. Enforce least privilege with authentication, ownership checks, RLS, registered tools, and permission gates.
3. Use a common provider adapter contract to avoid vendor lock-in.
4. Treat model output as untrusted; validate plans and tool arguments before execution.
5. Use mock adapters during development; do not expose arbitrary shell, eval, filesystem, or unrestricted network tools.
6. Keep APIs versioned under `/api/v1`.

## Technology stack
- Next.js 15 / React 19
- TypeScript
- Supabase Auth, Postgres, and Row Level Security
- Vercel
- Node.js 20+

## Getting started
### Prerequisites
- Node.js 20 or later
- npm
- A Supabase project

### Install and run
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
| `AI_PROVIDER_ENCRYPTION_KEY` | Server only | Encrypts stored provider credentials |

Never commit `.env.local` or real credentials. Never prefix a secret with `NEXT_PUBLIC_`. Keep `AI_PROVIDER_ENCRYPTION_KEY` stable; changing it without a key-rotation process makes existing encrypted credentials unreadable. See `.env.example`.

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
| GET | `/api/v1/ai/providers/health` | Authenticated mock-adapter smoke test |
| GET/PUT/DELETE | `/api/v1/ai/providers/keys` | Manage encrypted provider credentials |

The provider health endpoint tests only the mock adapter. It does not prove credential decryption or live vendor generation.

## Roadmap
- [x] Phase 0 — engineering baseline
- [x] Phase 1 — Supabase SSR authentication, profile API, and health foundation
- [x] Phase 2.2 — provider adapter contract and mock foundation
- [x] Phase 2.3 — encrypted provider credential storage foundation
- [ ] Phase 2.4 — workflow/model routing (initial policies and resolver exist; verification pending)
- [ ] Phase 2.5 — schema-validated agent planner
- [ ] Phase 2.6 — allow-listed tool registry and permission gates
- [ ] Phase 2.7 — bounded executor and result synthesizer
- [ ] Phase 2.8 — task persistence, lifecycle, and events
- [ ] Phase 2.9 — Control Centre integration with real backend workflows
- [ ] Phase 2.10 — security, integration, and deployment verification
- [ ] Android integration — authenticated app/backend connection and device capability bridge

A checked item means the foundation exists; it does not imply every production acceptance test has passed. See `docs/PHASE-2-ARCHITECTURE.md`.

## Quality checks
```bash
npm run typecheck
npm run build
```
The lint script should be treated as a required gate only after ESLint configuration and dependencies are verified.

## Security
See `SECURITY.md` for responsible vulnerability disclosure. Never include credentials or personal data in issues or pull requests.

## Contributing
Contributions must preserve the Android/backend boundary, server-only secret handling, API versioning, and least-privilege tool execution. Discuss substantial changes in an issue before submitting a pull request.

## License
No open-source license has been selected yet. Until a license file is added, public visibility does not grant permission to reuse, redistribute, or create derivative works. Choose and add an explicit license before accepting external contributions under open-source terms.