-- Personal owner mode uses a server-generated owner UUID, not a Supabase Auth user.
-- Remove auth.users foreign keys from server-only AI data so signup/login is not required.
alter table public.ai_provider_secrets
  drop constraint if exists ai_provider_secrets_user_id_fkey;
alter table private.ai_usage_buckets
  drop constraint if exists ai_usage_buckets_user_id_fkey;
alter table private.ai_provider_observations
  drop constraint if exists ai_provider_observations_user_id_fkey;

comment on column public.ai_provider_secrets.user_id is
  'Application owner identifier. In personal mode this is the fixed server-side owner UUID, not an auth.users id.';
comment on column private.ai_usage_buckets.user_id is
  'Application owner identifier used for server-side usage accounting.';
comment on column private.ai_provider_observations.user_id is
  'Application owner identifier used for server-side provider telemetry.';
