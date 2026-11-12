# Connections Hub

The Connections Hub is the owner's integration control plane. External services are connected once, credentials are stored server-side, and approved capabilities are exposed through the shared tool registry. Agent definitions must explicitly allow the tool IDs they may use. The planner, owner tools API and MCP `tools/list` consume the same sanitized registry.

## Available integrations

### GitHub — read-only repository access

The backend currently exposes four bounded, read-only tools for the fixed Futuristic System MCP Backend repository:

- `github.list_branches`
- `github.list_commits`
- `github.list_files`
- `github.read_file`

The optional `GITHUB_READ_TOKEN` is server-side, repository-scoped and never returned to an Agent. Arbitrary repository names and write operations are not supported.

### Web Search — Tavily

The `web.search` tool uses an owner-connected Tavily API key. The key is encrypted at rest with AES-256-GCM and stored in `integration_connections`; plaintext is not returned to the browser or written to application logs. Search is read-only, bounded to at most eight results, uses a timeout, and returns validated HTTP(S) source URLs with bounded excerpts.

Tavily is a search/retrieval service. It is not the language model that performs reasoning or answer generation.

### Remote MCP servers — restricted read-only discovery

Owner-managed remote MCP servers can be registered from **Dashboard → Connections → Remote MCP servers**. Registration performs an MCP `initialize` handshake and `tools/list` before saving the connection. Saved connections can be tested again to refresh their sanitized tool manifest.

Security restrictions:

- HTTPS only, port 443; public IPv4 resolution is required.
- The hostname is re-resolved for each request; non-public addresses are rejected and the HTTPS socket is pinned to a validated address.
- Redirects, URL credentials, fragments and query strings are rejected.
- Requests time out after 12 seconds; response bodies are capped at 1 MB and tool arguments at 16 KB.
- Only tools declaring `annotations.readOnlyHint === true` and no destructive hint are exposed.
- Remote schemas are reduced to bounded flat string, number, integer and boolean fields. Nested, array, object and unknown schema forms are excluded.
- Optional bearer credentials are encrypted at rest. Plaintext credentials and remote response bodies are not logged.

**Trust warning:** MCP annotations are declarations from the remote server, not cryptographic proof that a tool is safe or has no side effects. Connect only servers you trust. Remote MCP is not an arbitrary URL fetcher, remote-code executor, or write-capable automation channel.

## AI providers are separate from tool connections

Text generation currently uses the OpenAI and OpenRouter adapters configured through the AI provider settings. The mock provider is for deterministic tests and is not real inference. Tavily, GitHub and remote MCP are tool/data connections; they do not replace the AI model. Other entries in the model catalogue are not necessarily executable adapters in the current runtime.

See the root [README](../README.md) for the distinction between active adapters, planned providers and the zero-budget limitations.

## API

All routes below require owner authentication. Responses are private/no-store and do not include plaintext credential material.

- `GET /api/v1/connections` — list supported connection status and tools.
- `PUT /api/v1/connections` — connect/update Tavily using `{ "provider": "tavily", "apiKey": "..." }`.
- `DELETE /api/v1/connections` — disconnect Tavily using `{ "provider": "tavily" }`.
- `GET /api/v1/connections/remote-mcp` — list registered remote servers and sanitized tool manifests.
- `POST /api/v1/connections/remote-mcp` — register a server using `{ "name": "...", "endpoint": "https://host/path", "bearerToken": "..." }`.
- `POST /api/v1/connections/remote-mcp` with `{ "action": "test", "serverId": "uuid" }` — repeat the authenticated handshake and refresh its safe tool manifest.
- `DELETE /api/v1/connections/remote-mcp` — disconnect a server using `{ "serverId": "uuid" }`.

## Database and secrets

- Tavily connection storage uses `supabase/migrations/20261111150000_create_integration_connections.sql`.
- Remote MCP connection storage uses `supabase/migrations/20261112100000_create_remote_mcp_servers.sql`.
- Both require the existing `AI_PROVIDER_ENCRYPTION_KEY` (32-byte base64 AES-256 key).
- Review and apply migrations before using these features in another environment; the application does not apply migrations automatically.

## Agent and MCP behavior

The shared `TOOL_CATALOG` feeds planner discovery, Agent allowlists, the owner tools API and MCP `tools/list`. Tool calls are validated and dispatched through the registered backend executor. A tool being discoverable does not grant an Agent permission to use it: each Agent must have the relevant tool ID in its allowlist, and server-side execution restrictions still apply.

The Agent Lab provides **Run Agent test** for a real configured task pipeline and **Run safe test suite** for deterministic mock-provider checks. A mock test does not prove that a paid/cloud provider is configured or that an external integration works in production.
