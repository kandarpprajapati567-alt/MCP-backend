create table if not exists private.ai_usage_buckets (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_type text not null check (bucket_type in ('minute', 'day')),
  bucket_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  input_characters bigint not null default 0 check (input_characters >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket_type, bucket_start)
);

alter table private.ai_usage_buckets enable row level security;
revoke all on private.ai_usage_buckets from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.ai_usage_buckets to service_role;

create or replace function public.consume_ai_request(p_user_id uuid, p_input_characters integer)
returns table (allowed boolean, retry_after_seconds integer, reason text)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_minute timestamptz := pg_catalog.date_trunc('minute', v_now);
  v_day timestamptz := pg_catalog.date_trunc('day', v_now);
  v_minute_count integer;
  v_day_count integer;
  v_day_chars bigint;
  v_minute_limit constant integer := 10;
  v_day_limit constant integer := 200;
  v_day_character_limit constant bigint := 2000000;
begin
  if p_user_id is null or p_input_characters is null or p_input_characters < 1 then
    return query select false, 60, 'invalid_usage'::text; return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select b.request_count into v_minute_count from private.ai_usage_buckets b
    where b.user_id=p_user_id and b.bucket_type='minute' and b.bucket_start=v_minute;
  select b.request_count, b.input_characters into v_day_count, v_day_chars
    from private.ai_usage_buckets b where b.user_id=p_user_id and b.bucket_type='day' and b.bucket_start=v_day;
  if coalesce(v_minute_count,0) >= v_minute_limit then
    return query select false, greatest(1, 60 - extract(second from v_now)::integer), 'minute_limit'::text; return;
  end if;
  if coalesce(v_day_count,0) >= v_day_limit or coalesce(v_day_chars,0)+p_input_characters > v_day_character_limit then
    return query select false, greatest(1, 86400 - extract(epoch from (v_now-v_day))::integer), 'daily_limit'::text; return;
  end if;
  insert into private.ai_usage_buckets(user_id,bucket_type,bucket_start,request_count,input_characters)
    values(p_user_id,'minute',v_minute,1,p_input_characters)
    on conflict(user_id,bucket_type,bucket_start) do update
    set request_count=private.ai_usage_buckets.request_count+1,
        input_characters=private.ai_usage_buckets.input_characters+excluded.input_characters, updated_at=v_now;
  insert into private.ai_usage_buckets(user_id,bucket_type,bucket_start,request_count,input_characters)
    values(p_user_id,'day',v_day,1,p_input_characters)
    on conflict(user_id,bucket_type,bucket_start) do update
    set request_count=private.ai_usage_buckets.request_count+1,
        input_characters=private.ai_usage_buckets.input_characters+excluded.input_characters, updated_at=v_now;
  return query select true, 0, 'ok'::text;
end;
$$;
revoke all on function public.consume_ai_request(uuid,integer) from public,anon,authenticated;
grant execute on function public.consume_ai_request(uuid,integer) to service_role;

create or replace function public.record_ai_output_usage(p_user_id uuid,p_output_tokens bigint)
returns void language plpgsql security invoker set search_path=''
as $$
begin
  if p_user_id is null or p_output_tokens is null or p_output_tokens < 0 then raise exception 'Invalid usage values'; end if;
  update private.ai_usage_buckets set output_tokens=output_tokens+p_output_tokens, updated_at=pg_catalog.now()
  where user_id=p_user_id and bucket_type='day' and bucket_start=pg_catalog.date_trunc('day',pg_catalog.now());
end;
$$;
revoke all on function public.record_ai_output_usage(uuid,bigint) from public,anon,authenticated;
grant execute on function public.record_ai_output_usage(uuid,bigint) to service_role;
