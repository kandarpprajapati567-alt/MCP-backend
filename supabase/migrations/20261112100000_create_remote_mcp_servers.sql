-- Owner-managed remote MCP connections. Credentials are encrypted at rest and
-- remote tools are restricted to explicitly read-only server declarations.
create table if not exists public.remote_mcp_servers (
  id uuid primary key,
  owner_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  endpoint_url text not null check (char_length(endpoint_url) between 1 and 2048),
  encrypted_secret text,
  iv text,
  auth_tag text,
  key_version integer,
  enabled boolean not null default true,
  discovered_tools jsonb not null default '[]'::jsonb,
  protocol_version text not null default '2025-11-25',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (encrypted_secret is null and iv is null and auth_tag is null and key_version is null)
    or
    (encrypted_secret is not null and iv is not null and auth_tag is not null and key_version = 1)
  )
);

create index if not exists remote_mcp_servers_owner_idx
  on public.remote_mcp_servers(owner_id, enabled, created_at desc);

alter table public.remote_mcp_servers enable row level security;
revoke all on public.remote_mcp_servers from public, anon, authenticated;
grant select, insert, update, delete on public.remote_mcp_servers to service_role;

drop trigger if exists remote_mcp_servers_set_updated_at on public.remote_mcp_servers;
create trigger remote_mcp_servers_set_updated_at
  before update on public.remote_mcp_servers
  for each row execute function private.set_updated_at();

comment on table public.remote_mcp_servers is
  'Owner-only remote MCP endpoints with encrypted bearer credentials and sanitized read-only tool manifests.';
