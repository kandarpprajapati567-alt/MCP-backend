# Futuristic System Web

Separate Next.js control centre and future backend for the Futuristic System platform. It does **not** modify or replace the Android app (`com.futuristic.system`).

## Requirements

- Node.js 20+
- npm

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

## Quality checks

```bash
npm run typecheck
npm run build
```

The `lint` script is declared in `package.json`, but ESLint and its configuration still need to be added before it can be treated as a reliable check.

## Supabase setup

Set these values in `.env.local` for local development and in the Vercel project's environment settings for each deployment environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Use the project's publishable key (or legacy anon key only if needed for compatibility). Never put a Supabase secret/service-role key in a `NEXT_PUBLIC_*` variable or browser code. This application uses cookie-based SSR sessions through `@supabase/ssr`.

In Supabase Authentication settings, configure the Site URL and allowed redirect URLs to include the deployed app URL and local development callback:
- `https://YOUR_APP_DOMAIN/auth/callback`
- `http://localhost:3000/auth/callback`

Email/password sign-up may require email confirmation depending on the project's Auth settings. OAuth providers are not enabled by this phase.

## Implemented API

- `GET /api/v1/health` — checks whether the profile table is reachable.
- `POST /api/v1/auth/signup` — email/password registration.
- `POST /api/v1/auth/login` — email/password sign-in.
- `POST /api/v1/auth/logout` — sign-out and clear session cookies.
- `GET /api/v1/auth/me` — validates the signed-in identity with `getClaims()`.
- `GET /auth/callback` — exchanges the PKCE authorization code.
- `GET /api/v1/profile` — reads the caller's own profile.
- `PATCH /api/v1/profile` — updates the caller's own profile under database RLS.

All profile access uses the authenticated user's cookie-backed client and the database's own-row RLS policies. No service-role key is used.

## Current implementation status

Phase 0 baseline is complete. Phase 1 adds the Supabase SSR clients, cookie refresh, email/password auth endpoints, PKCE callback, profile API, and health check. AI provider execution, search, MCP tools, device pairing, and authenticated business workflows remain future phases.

See [Phase 0 engineering baseline](docs/PHASE-0-BASELINE.md) for verified findings and architecture boundaries.
