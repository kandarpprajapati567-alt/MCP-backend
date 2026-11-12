# Secure remote MCP connections

Remote MCP servers can be registered from **Dashboard → Connections → Remote MCP servers**.

## Supported contract

- Streamable HTTP JSON-RPC over HTTPS only, on port 443.
- MCP protocol version `2025-11-25`.
- Optional bearer token, encrypted at rest with the existing AES-256-GCM provider-secret key.
- Server registration performs `initialize` and `tools/list` before saving the connection.
- Discovered tools are available in the shared tool API, Agent planner and this backend's MCP `tools/list` response.
- Agents must explicitly assign each remote tool in their own allowlist.

## Security restrictions

- Hostnames must resolve to public IPv4 addresses. IPv6 and IP-literal endpoints are intentionally not accepted.
- Every request resolves the hostname again, rejects the connection if any returned address is non-public, then pins the HTTPS socket to one validated address. TLS certificate validation and SNI still use the registered hostname.
- Redirects are not followed; non-HTTPS and non-443 ports are rejected.
- URL credentials, fragments and query strings are rejected so bearer secrets cannot be hidden in URLs.
- Request timeout is 12 seconds; response body is capped at 1 MB; request arguments are capped at 16 KB.
- Only tools with `annotations.readOnlyHint === true` and no destructive hint are exposed.
- Remote input schemas are reduced to bounded flat string, number, integer and boolean fields. Nested, array, object and unknown schemas are excluded.
- Credentials and remote response bodies are never written to application logs by this connector.

**Trust warning:** MCP annotations are declarations made by the remote server, not cryptographic proof that a tool has no side effects. Connect only servers you trust. This first implementation intentionally excludes write-capable and unannotated tools; it does not provide a general remote-code or arbitrary-URL execution channel.

## Database and environment

Apply `supabase/migrations/20261112100000_create_remote_mcp_servers.sql` and configure the existing `AI_PROVIDER_ENCRYPTION_KEY` (32-byte base64 AES-256 key). No additional paid service is required.

## API

- `GET /api/v1/connections/remote-mcp` — list registered servers and sanitized tool manifests.
- `POST /api/v1/connections/remote-mcp` — validate and register `{ "name": "...", "endpoint": "https://host/path", "bearerToken": "..." }`.
- `POST /api/v1/connections/remote-mcp` with `{ "action": "test", "serverId": "uuid" }` — repeat the authenticated MCP handshake and `tools/list`, then refresh the sanitized tool manifest. The Connections Hub exposes this as **Test connection** for each saved server.
- **Dashboard → Agent Lab** includes **Run Agent test** for a real task-pipeline execution and **Run safe test suite** for no-cost deterministic Mock-provider checks, with pass/fail/skipped results and execution history.
- `DELETE /api/v1/connections/remote-mcp` — disconnect `{ "serverId": "uuid" }`.

All endpoints require the owner master token. Plaintext bearer credentials are never returned.