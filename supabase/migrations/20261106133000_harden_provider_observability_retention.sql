grant usage, select on sequence private.ai_provider_observations_id_seq to service_role;

create or replace function public.record_ai_provider_observation(
  p_user_id uuid, p_provider_id text, p_outcome text, p_latency_ms integer, p_error_code text default null
) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if p_user_id is null
    or p_provider_id not in ('mock','openai','openrouter')
    or p_outcome not in ('success','failure')
    or p_latency_ms is null or p_latency_ms < 0 or p_latency_ms > 300000
    or (p_error_code is not null and p_error_code not in ('TIMEOUT','RATE_LIMITED','AUTHENTICATION_FAILED','PROVIDER_UNAVAILABLE','UNKNOWN'))
  then raise exception 'Invalid provider observation'; end if;

  delete from private.ai_provider_observations
  where observed_at < pg_catalog.now() - interval '30 days';

  insert into private.ai_provider_observations(user_id,provider_id,outcome,latency_ms,error_code)
  values(p_user_id,p_provider_id,p_outcome,p_latency_ms,p_error_code);
end;
$$;