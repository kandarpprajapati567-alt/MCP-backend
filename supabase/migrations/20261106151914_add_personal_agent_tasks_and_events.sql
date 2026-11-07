create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued','planning','awaiting_approval','executing','synthesizing','completed','failed','cancelled')),
  task text not null check (char_length(task) between 1 and 4000),
  plan jsonb,
  tool_results jsonb not null default '[]'::jsonb,
  result text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists agent_tasks_owner_created_idx
  on public.agent_tasks(owner_id, created_at desc);
alter table public.agent_tasks enable row level security;
revoke all on public.agent_tasks from public, anon, authenticated;
grant select, insert, update, delete on public.agent_tasks to service_role;

create table if not exists public.agent_task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  owner_id uuid not null,
  event_type text not null
    check (event_type in ('task.created','task.planning','task.plan_ready','task.executing','tool.completed','task.synthesizing','task.completed','task.failed','task.cancelled')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_task_events_task_created_idx
  on public.agent_task_events(task_id, created_at);
create index if not exists agent_task_events_owner_created_idx
  on public.agent_task_events(owner_id, created_at desc);
alter table public.agent_task_events enable row level security;
revoke all on public.agent_task_events from public, anon, authenticated;
grant select, insert, update, delete on public.agent_task_events to service_role;
grant usage, select on sequence public.agent_task_events_id_seq to service_role;
