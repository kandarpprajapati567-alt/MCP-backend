# Futuristic System Web

Separate Next.js control centre and future backend for the Futuristic System platform. It does **not** modify or replace the Android app (`com.futuristic.system`).

## Requirements

- Node.js 20+
- npm

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Quality checks

```bash
npm run typecheck
npm run build
```

The `lint` script is declared in `package.json`, but ESLint and its configuration still need to be added before it can be treated as a reliable check.

## Environment

Copy `.env.example` to `.env.local` and fill only the values for services that have actually been implemented and provisioned. Never expose server secrets through `NEXT_PUBLIC_*` variables.

## Current implementation status

This repository currently contains the Next.js dashboard scaffold and a basic versioned health route. Database, authentication, AI provider execution, search, MCP tools, device pairing, and authenticated APIs are not implemented yet. Dashboard placeholders are not live backend capabilities.

See [Phase 0 engineering baseline](docs/PHASE-0-BASELINE.md) for verified findings, boundaries, API conventions, and remaining foundation work.
