-- Secret-safe audit trail for owner-scoped Remote MCP invocations.
-- Raw arguments, credentials, endpoint URLs and response bodies are never stored.
create table if not exists public.remote_mcp_audit_events (
  id uuid primary key,
  owner_id uuid not null,
  server_id uuid not null,
  task_id uuid,
  tool_id text not null check (char_length(tool_id) between 1 and 200),
  tool_name text not null check (char_length(tool_name) between 1 and 80),
  source text not null check (source in ('agent_task', 'mcp_direct', 'unknown')),
  argument_digest text not null check (argument_digest ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('started', 'completed', 'failed', 'audit_pending')),
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_ms integer check (duration_ms between 0 and 120000),
  response_bytes integer check (response_bytes between 0 and 1048576),
  output_bytes integer check (output_bytes between 0 and 98304),
  content_items integer check (content_items between 0 and 12),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  created_at timestamptz not null default now(),
  check (
    (status = 'started' and completed_at is null and error_code is null)
    or
    (status = 'completed' and completed_at is not null and error_code is null)
    or
    (status in ('failed', 'audit_pending') and completed_at is not null and error_code is not null)
  )
);

create index if not exists remote_mcp_audit_owner_created_idx
  on public.remote_mcp_audit_events(owner_id, created_at desc);

create index if not exists remote_mcp_audit_server_created_idx
  on public.remote_mcp_audit_events(owner_id, server_id, created_at desc);

create index if not exists remote_mcp_audit_task_idx
  on public.remote_mcp_audit_events(owner_id, task_id, created_at desc)
  where task_id is not null;

alter table public.remote_mcp_audit_events enable row level security;
revoke all on public.remote_mcp_audit_events from public, anon, authenticated;
grant select, insert, update on public.remote_mcp_audit_events to service_role;

comment on table public.remote_mcp_audit_events is
  'Owner-scoped Remote MCP invocation audit. Stores argument SHA-256 digests and bounded outcome metadata only; never raw arguments, secrets or response bodies.';
