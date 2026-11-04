# Phase 0 — Engineering Baseline

**Status:** baseline documented; automated checks added.  
**Baseline branch:** main  
**Baseline commit inspected:** 18e4fd658f5f410c32b1424abc0c82a48c384eea

## 1. Verified repository facts

- Next.js 15.5.28, React 19.1.0, TypeScript 5.6, Tailwind CSS 3.4.
- App Router project under `src/app`; path alias `@/*` maps to `src/*`.
- Existing runtime route: `GET /api/v1/health`.
- No database, auth, provider SDK, MCP SDK, queue, ORM, schema/migration, or test framework is present in the inspected tree.
- No package lockfile was present in the inspected tree.
- Dashboard routes are presentation-only placeholders; do not treat their displayed status as live configuration.
- `.env.example` lists intended Supabase, search, and MCP variables; values are blank/commented.
- Vercel account/project linkage could not be verified from the available connected Vercel context (no teams returned).

## 2. Current boundaries

- `src/app/**/page.tsx`: route/UI layer.
- `src/components/**`: reusable presentation components.
- `src/lib/**`: shared non-secret utilities and navigation.
- Future server-only code must live in clearly named server modules (for example `src/server/**`) and import `server-only` before accessing credentials, database clients, provider adapters, or privileged operations.
- Never put service-role keys, provider keys, device signing secrets, or MCP credentials in `NEXT_PUBLIC_*` variables.
- Browser code must call authenticated API routes; it must never connect directly with privileged credentials.

## 3. API conventions for Phase 1+

- Keep public API paths versioned under `/api/v1`.
- Validate every request at the boundary (body, query, path, and content type); reject unknown or malformed input.
- Use consistent JSON errors: `{ "error": { "code": "STABLE_CODE", "message": "Safe message", "requestId": "..." } }`.
- Never return stack traces, secrets, raw provider errors, or internal database details to clients.
- Use appropriate HTTP status codes; health checks must distinguish process liveness from dependency readiness.
- Set explicit cache policy for authenticated and sensitive responses (normally `no-store`).
- Add authentication, authorization, ownership checks, and rate limits before exposing user/device/task operations.
- Keep OpenAPI documentation synchronized with implemented routes; do not document planned routes as live.

## 4. Required quality gates

- Install dependencies from a committed lockfile once one is generated and reviewed.
- Typecheck with `npm run typecheck`.
- Build with `npm run build`.
- Lint with `npm run lint` after the repository has an ESLint dependency/configuration. The current manifest defines the script but does not declare ESLint or an ESLint config.
- Add focused tests alongside each backend capability before calling that capability complete.

## 5. Known Phase 0 gaps / follow-ups

1. Generate and commit the correct npm lockfile from a trusted Node 20+ environment.
2. Add ESLint and a Next.js-compatible configuration, then make lint a required CI gate.
3. Add unit/integration test tooling and a minimal test suite.
4. Verify Vercel project linkage, build settings, environment variable names, and latest deployment with an authorized Vercel project connection.
5. Run CI and record actual typecheck/build results before marking the baseline fully green.

## 6. Scope guard

This phase does not implement Supabase, authentication, AI providers, MCP, search, device pairing, or Android connectivity. Those belong to later phases and must be added incrementally with security and tests.
