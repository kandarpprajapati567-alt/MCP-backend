create or replace function public.get_ai_usage_status(p_user_id uuid)
returns table (
  minute_requests_used integer,
  minute_requests_limit integer,
  minute_resets_at timestamptz,
  daily_requests_used integer,
  daily_requests_limit integer,
  daily_input_characters_used bigint,
  daily_input_characters_limit bigint,
  daily_output_tokens_used bigint,
  daily_resets_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_minute timestamptz := pg_catalog.date_trunc('minute', v_now);
  v_day timestamptz := pg_catalog.date_trunc('day', v_now);
begin
  if p_user_id is null then
    raise exception 'A user id is required';
  end if;

  return query
  select
    coalesce((select b.request_count from private.ai_usage_buckets b
      where b.user_id = p_user_id and b.bucket_type = 'minute' and b.bucket_start = v_minute), 0),
    10,
    v_minute + interval '1 minute',
    coalesce((select b.request_count from private.ai_usage_buckets b
      where b.user_id = p_user_id and b.bucket_type = 'day' and b.bucket_start = v_day), 0),
    200,
    coalesce((select b.input_characters from private.ai_usage_buckets b
      where b.user_id = p_user_id and b.bucket_type = 'day' and b.bucket_start = v_day), 0),
    2000000::bigint,
    coalesce((select b.output_tokens from private.ai_usage_buckets b
      where b.user_id = p_user_id and b.bucket_type = 'day' and b.bucket_start = v_day), 0),
    v_day + interval '1 day';
end;
$$;

revoke all on function public.get_ai_usage_status(uuid) from public, anon, authenticated;
grant execute on function public.get_ai_usage_status(uuid) to service_role;
