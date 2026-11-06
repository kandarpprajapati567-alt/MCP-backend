create table if not exists private.ai_provider_observations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_id text not null check (provider_id in ('mock','openai','openrouter')),
  outcome text not null check (outcome in ('success','failure')),
  latency_ms integer not null check (latency_ms >= 0 and latency_ms <= 300000),
  error_code text check (error_code is null or error_code in ('TIMEOUT','RATE_LIMITED','AUTHENTICATION_FAILED','PROVIDER_UNAVAILABLE','UNKNOWN')),
  observed_at timestamptz not null default pg_catalog.now()
);
create index if not exists ai_provider_observations_user_provider_time_idx
  on private.ai_provider_observations(user_id, provider_id, observed_at desc);
alter table private.ai_provider_observations enable row level security;
revoke all on private.ai_provider_observations from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, delete on private.ai_provider_observations to service_role;

create or replace function public.record_ai_provider_observation(
  p_user_id uuid, p_provider_id text, p_outcome text, p_latency_ms integer, p_error_code text default null
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null
    or p_provider_id not in ('mock','openai','openrouter')
    or p_outcome not in ('success','failure')
    or p_latency_ms is null or p_latency_ms < 0 or p_latency_ms > 300000
    or (p_error_code is not null and p_error_code not in ('TIMEOUT','RATE_LIMITED','AUTHENTICATION_FAILED','PROVIDER_UNAVAILABLE','UNKNOWN'))
  then raise exception 'Invalid provider observation'; end if;
  insert into private.ai_provider_observations(user_id,provider_id,outcome,latency_ms,error_code)
  values(p_user_id,p_provider_id,p_outcome,p_latency_ms,p_error_code);
end;
$$;
revoke all on function public.record_ai_provider_observation(uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.record_ai_provider_observation(uuid,text,text,integer,text) to service_role;

create or replace function public.get_ai_provider_observations(p_user_id uuid)
returns table (
  provider_id text, requests_24h bigint, successes_24h bigint, failures_24h bigint,
  average_latency_ms numeric, last_observed_at timestamptz
) language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null then raise exception 'A user id is required'; end if;
  return query
  select o.provider_id, count(*)::bigint,
    count(*) filter (where o.outcome='success')::bigint,
    count(*) filter (where o.outcome='failure')::bigint,
    round(avg(o.latency_ms), 1), max(o.observed_at)
  from private.ai_provider_observations o
  where o.user_id=p_user_id and o.observed_at >= pg_catalog.now() - interval '24 hours'
  group by o.provider_id;
end;
$$;
revoke all on function public.get_ai_provider_observations(uuid) from public,anon,authenticated;
grant execute on function public.get_ai_provider_observations(uuid) to service_role;