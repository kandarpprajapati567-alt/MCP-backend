-- Owner-managed encrypted credentials for external service integrations.
create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  provider text not null check (provider in ('tavily')),
  encrypted_secret text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null default 1 check (key_version = 1),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider)
);

create index if not exists integration_connections_owner_idx
  on public.integration_connections(owner_id, provider);

alter table public.integration_connections enable row level security;
revoke all on public.integration_connections from public, anon, authenticated;
grant select, insert, update, delete on public.integration_connections to service_role;

drop trigger if exists integration_connections_set_updated_at on public.integration_connections;
create trigger integration_connections_set_updated_at
  before update on public.integration_connections
  for each row execute function private.set_updated_at();

comment on table public.integration_connections is
  'Server-only encrypted external integration credentials. Plaintext secrets are never exposed to clients.';
