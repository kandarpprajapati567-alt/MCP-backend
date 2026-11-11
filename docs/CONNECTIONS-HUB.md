# Connections Hub — First integration slice

## Architecture

External integrations are connected centrally and exposed as allow-listed tools. Agent definitions select tool IDs from the same registry; the planner only receives tools in that Agent's allowlist. MCP `tools/list` reads the same catalog and `tools/call` uses the same executor.

## Available integrations

- **GitHub** — existing read-only repository tools: `github.list_branches`, `github.list_commits`, `github.list_files`, and `github.read_file`. Uses the server-side `GITHUB_READ_TOKEN` environment variable.
- **Web Search** — new `web.search` tool using Tavily. Connect a Tavily API key from Dashboard → Connections. The key is encrypted with the existing AES-256-GCM provider-secret utility and stored in `integration_connections`; plaintext is never returned to the browser or logged.
- **Remote MCP servers** — not yet connected in this slice. The Connections UI marks this explicitly as coming soon; remote transport, server trust, tool discovery, and per-server credentials require a separate security-reviewed implementation.

## API

- GET `/api/v1/connections` — owner-authenticated connection status and supported tools.
- PUT `/api/v1/connections` — store a Tavily key (body: `{ "provider": "tavily", "apiKey": "..." }`).
- DELETE `/api/v1/connections` — disconnect Tavily (body: `{ "provider": "tavily" }`).

All endpoints require the existing owner master token. Responses are private/no-store and never include credential material.

## Database

Apply `supabase/migrations/20261111150000_create_integration_connections.sql`. The table has RLS enabled, direct access revoked from public/anon/authenticated, and service-role-only access. The server also requires the existing `AI_PROVIDER_ENCRYPTION_KEY` to encrypt/decrypt stored credentials.

## Agent and MCP behavior

The `web.search` schema is registered in `TOOL_CATALOG`. Agent planner discovery, Agent allowlists, the owner tools API, and MCP `tools/list` therefore expose the same tool contract. Execution is read-only, bounded to eight results, uses a 15-second timeout, and returns validated HTTP(S) source URLs and bounded excerpts.
