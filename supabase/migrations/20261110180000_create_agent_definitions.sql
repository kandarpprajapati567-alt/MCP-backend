-- Persistent, owner-managed agent definitions for the Agent Manager.
-- Access is server-only through the service role and owner-token protected APIs.

create table if not exists public.agent_definitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  role text not null check (char_length(role) between 1 and 120),
  instructions text not null check (char_length(instructions) between 1 and 12000),
  provider_preference text not null default 'auto'
    check (provider_preference in ('auto','openai','openrouter','mock')),
  model_preference text check (model_preference is null or char_length(model_preference) between 1 and 160),
  allowed_tools text[] not null default '{}',
  max_steps smallint not null default 8 check (max_steps between 1 and 8),
  max_tool_calls smallint not null default 4 check (max_tool_calls between 0 and 4),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name),
  check (array_length(allowed_tools, 1) is null or cardinality(allowed_tools) <= 40)
);

create index if not exists agent_definitions_owner_updated_idx
  on public.agent_definitions(owner_id, updated_at desc);

alter table public.agent_definitions enable row level security;
revoke all on public.agent_definitions from public, anon, authenticated;
grant select, insert, update, delete on public.agent_definitions to service_role;

drop trigger if exists agent_definitions_set_updated_at on public.agent_definitions;
create trigger agent_definitions_set_updated_at
  before update on public.agent_definitions
  for each row execute function private.set_updated_at();
