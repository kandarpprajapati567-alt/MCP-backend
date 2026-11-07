-- Persistent memory, Android device capability registry, remote tool jobs and workflow policies.
-- All tables are server-managed: RLS is enabled and direct client roles have no grants or policies.

alter table public.agent_tasks
  drop constraint if exists agent_tasks_status_check;
alter table public.agent_tasks
  add constraint agent_tasks_status_check
  check (status = any (array[
    'queued','planning','awaiting_approval','waiting_for_device','executing',
    'synthesizing','completed','failed','cancelled'
  ]));

alter table public.agent_task_events
  drop constraint if exists agent_task_events_event_type_check;
alter table public.agent_task_events
  add constraint agent_task_events_event_type_check
  check (event_type = any (array[
    'task.created','task.planning','task.plan_ready','task.executing',
    'tool.requested','tool.claimed','tool.completed','tool.failed',
    'task.synthesizing','task.completed','task.failed','task.cancelled',
    'device.registered','device.heartbeat',
    'memory.created','memory.updated','memory.deleted'
  ]));

create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  namespace text not null default 'default' check (char_length(namespace) between 1 and 80),
  memory_key text not null check (char_length(memory_key) between 1 and 160),
  content text not null check (char_length(content) between 1 and 12000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  source text not null default 'manual' check (source in ('manual','agent','task','android','import')),
  importance smallint not null default 3 check (importance between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, namespace, memory_key)
);
create index if not exists agent_memories_owner_namespace_updated_idx
  on public.agent_memories(owner_id, namespace, updated_at desc);
create index if not exists agent_memories_content_search_idx
  on public.agent_memories using gin (to_tsvector('simple', content));
alter table public.agent_memories enable row level security;
revoke all on public.agent_memories from public, anon, authenticated;
grant select, insert, update, delete on public.agent_memories to service_role;
drop trigger if exists agent_memories_set_updated_at on public.agent_memories;
create trigger agent_memories_set_updated_at before update on public.agent_memories
  for each row execute function private.set_updated_at();

create table if not exists public.agent_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  device_id text not null check (char_length(device_id) between 1 and 128),
  display_name text not null check (char_length(display_name) between 1 and 120),
  platform text not null check (platform in ('android','windows','web','other')),
  app_version text check (app_version is null or char_length(app_version) <= 80),
  capabilities jsonb not null default '[]'::jsonb
    check (jsonb_typeof(capabilities) = 'array' and jsonb_array_length(capabilities) <= 100),
  status text not null default 'offline' check (status in ('online','offline')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, device_id)
);
create index if not exists agent_devices_owner_status_idx
  on public.agent_devices(owner_id, status, last_seen_at desc);
alter table public.agent_devices enable row level security;
revoke all on public.agent_devices from public, anon, authenticated;
grant select, insert, update, delete on public.agent_devices to service_role;
drop trigger if exists agent_devices_set_updated_at on public.agent_devices;
create trigger agent_devices_set_updated_at before update on public.agent_devices
  for each row execute function private.set_updated_at();

create table if not exists public.agent_tool_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  task_id uuid references public.agent_tasks(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 1 and 128),
  tool_call_id text not null check (char_length(tool_call_id) between 1 and 80),
  tool_id text not null check (char_length(tool_id) between 1 and 160),
  arguments jsonb not null default '{}'::jsonb check (jsonb_typeof(arguments) = 'object'),
  status text not null default 'queued' check (status in ('queued','claimed','completed','failed','cancelled','expired')),
  result jsonb check (result is null or jsonb_typeof(result) in ('object','array','string','number','boolean','null')),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (task_id, tool_call_id)
);
create index if not exists agent_tool_jobs_owner_status_requested_idx
  on public.agent_tool_jobs(owner_id, status, requested_at);
create index if not exists agent_tool_jobs_device_status_requested_idx
  on public.agent_tool_jobs(owner_id, device_id, status, requested_at);
alter table public.agent_tool_jobs enable row level security;
revoke all on public.agent_tool_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.agent_tool_jobs to service_role;
drop trigger if exists agent_tool_jobs_set_updated_at on public.agent_tool_jobs;
create trigger agent_tool_jobs_set_updated_at before update on public.agent_tool_jobs
  for each row execute function private.set_updated_at();

create table if not exists public.ai_workflow_policies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  workflow text not null check (workflow in ('planner','coding','research','summarization','chat','notes')),
  primary_provider text not null check (primary_provider in ('mock','openai','openrouter')),
  primary_model text not null check (char_length(primary_model) between 1 and 160),
  fallback_providers text[] not null default '{}',
  fallback_model text check (fallback_model is null or char_length(fallback_model) <= 160),
  required_capabilities text[] not null default array['text-generation'],
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, workflow),
  check (array_length(fallback_providers, 1) is null or fallback_providers <@ array['mock','openai','openrouter']::text[]),
  check (required_capabilities <@ array['text-generation','structured-output']::text[])
);
alter table public.ai_workflow_policies enable row level security;
revoke all on public.ai_workflow_policies from public, anon, authenticated;
grant select, insert, update, delete on public.ai_workflow_policies to service_role;
drop trigger if exists ai_workflow_policies_set_updated_at on public.ai_workflow_policies;
create trigger ai_workflow_policies_set_updated_at before update on public.ai_workflow_policies
  for each row execute function private.set_updated_at();

grant usage on schema public to service_role;
