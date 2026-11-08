-- AI Media Engine metadata foundation.
-- Large media bytes belong in object storage; Postgres stores projects, continuity metadata and job state.
-- All access is server-mediated through service_role and owner-authenticated routes.

create table if not exists public.media_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null check (char_length(title) between 1 and 160),
  logline text not null default '' check (char_length(logline) <= 2000),
  genre text not null default 'other'
    check (genre in ('drama','romance','action','horror','thriller','science-fiction','fantasy','other')),
  format text not null default 'episodic'
    check (format in ('episodic','short-film','feature-film')),
  target_episode_seconds integer not null default 600
    check (target_episode_seconds between 30 and 3600),
  status text not null default 'draft'
    check (status in ('draft','in-production','completed','archived')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists media_projects_owner_updated_idx
  on public.media_projects(owner_id, updated_at desc);
alter table public.media_projects enable row level security;
revoke all on public.media_projects from public, anon, authenticated;
grant select, insert, update, delete on public.media_projects to service_role;
drop trigger if exists media_projects_set_updated_at on public.media_projects;
create trigger media_projects_set_updated_at before update on public.media_projects
  for each row execute function private.set_updated_at();

create table if not exists public.media_characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  project_id uuid not null references public.media_projects(id) on delete cascade,
  character_key text not null check (char_length(character_key) between 1 and 80),
  display_name text not null check (char_length(display_name) between 1 and 120),
  age_years smallint check (age_years is null or age_years between 0 and 120),
  character_kind text not null default 'fictional'
    check (character_kind in ('fictional','consented-real-likeness')),
  consent_status text not null default 'not-required'
    check (consent_status in ('not-required','pending','verified','revoked')),
  description text not null default '' check (char_length(description) <= 4000),
  appearance jsonb not null default '{}'::jsonb check (jsonb_typeof(appearance) = 'object'),
  voice_profile jsonb not null default '{}'::jsonb check (jsonb_typeof(voice_profile) = 'object'),
  reference_assets jsonb not null default '[]'::jsonb
    check (jsonb_typeof(reference_assets) = 'array' and jsonb_array_length(reference_assets) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, character_key)
);
create index if not exists media_characters_owner_project_idx
  on public.media_characters(owner_id, project_id, created_at);
alter table public.media_characters enable row level security;
revoke all on public.media_characters from public, anon, authenticated;
grant select, insert, update, delete on public.media_characters to service_role;
drop trigger if exists media_characters_set_updated_at on public.media_characters;
create trigger media_characters_set_updated_at before update on public.media_characters
  for each row execute function private.set_updated_at();

create table if not exists public.media_scenes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  project_id uuid not null references public.media_projects(id) on delete cascade,
  episode_number integer not null default 1 check (episode_number between 1 and 1000),
  scene_number integer not null check (scene_number between 1 and 10000),
  title text not null check (char_length(title) between 1 and 200),
  script text not null default '' check (char_length(script) <= 12000),
  shot_plan jsonb not null default '[]'::jsonb
    check (jsonb_typeof(shot_plan) = 'array' and jsonb_array_length(shot_plan) <= 100),
  continuity_notes jsonb not null default '{}'::jsonb check (jsonb_typeof(continuity_notes) = 'object'),
  status text not null default 'draft' check (status in ('draft','ready','generating','review','approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, episode_number, scene_number)
);
create index if not exists media_scenes_owner_project_episode_idx
  on public.media_scenes(owner_id, project_id, episode_number, scene_number);
alter table public.media_scenes enable row level security;
revoke all on public.media_scenes from public, anon, authenticated;
grant select, insert, update, delete on public.media_scenes to service_role;
drop trigger if exists media_scenes_set_updated_at on public.media_scenes;
create trigger media_scenes_set_updated_at before update on public.media_scenes
  for each row execute function private.set_updated_at();

create table if not exists public.media_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  project_id uuid not null references public.media_projects(id) on delete cascade,
  scene_id uuid references public.media_scenes(id) on delete set null,
  job_type text not null check (job_type in ('image-generation','video-generation','audio-generation','lip-sync','upscale')),
  model_id text not null check (char_length(model_id) between 1 and 120),
  provider_id text not null check (char_length(provider_id) between 1 and 80),
  prompt text not null check (char_length(prompt) between 1 and 8000),
  negative_prompt text check (negative_prompt is null or char_length(negative_prompt) <= 2000),
  parameters jsonb not null default '{}'::jsonb check (jsonb_typeof(parameters) = 'object'),
  input_assets jsonb not null default '[]'::jsonb
    check (jsonb_typeof(input_assets) = 'array' and jsonb_array_length(input_assets) <= 30),
  content_rating text not null default 'general' check (content_rating in ('general','mature','adult')),
  status text not null default 'queued'
    check (status in ('queued','claimed','running','completed','failed','cancelled')),
  worker_id text check (worker_id is null or char_length(worker_id) <= 128),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 5),
  lease_expires_at timestamptz,
  result_assets jsonb not null default '[]'::jsonb
    check (jsonb_typeof(result_assets) = 'array' and jsonb_array_length(result_assets) <= 30),
  error_code text check (error_code is null or char_length(error_code) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists media_jobs_owner_created_idx
  on public.media_generation_jobs(owner_id, created_at desc);
create index if not exists media_jobs_queue_idx
  on public.media_generation_jobs(status, created_at)
  where status in ('queued','claimed','running');
create index if not exists media_jobs_worker_lease_idx
  on public.media_generation_jobs(worker_id, lease_expires_at)
  where status in ('claimed','running');
alter table public.media_generation_jobs enable row level security;
revoke all on public.media_generation_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.media_generation_jobs to service_role;
drop trigger if exists media_generation_jobs_set_updated_at on public.media_generation_jobs;
create trigger media_generation_jobs_set_updated_at before update on public.media_generation_jobs
  for each row execute function private.set_updated_at();
