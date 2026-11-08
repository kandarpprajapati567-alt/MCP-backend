create table if not exists public.media_generation_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null,
  job_id uuid not null references public.media_generation_jobs(id) on delete cascade,
  event_type text not null check (event_type in (
    'job.created','job.claimed','job.started','job.progress','job.completed','job.failed','job.cancelled'
  )),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists media_generation_events_job_created_idx
  on public.media_generation_events(job_id, created_at);
create index if not exists media_generation_events_owner_created_idx
  on public.media_generation_events(owner_id, created_at desc);
alter table public.media_generation_events enable row level security;
revoke all on public.media_generation_events from public, anon, authenticated;
grant select, insert, update, delete on public.media_generation_events to service_role;
grant usage, select on sequence public.media_generation_events_id_seq to service_role;
