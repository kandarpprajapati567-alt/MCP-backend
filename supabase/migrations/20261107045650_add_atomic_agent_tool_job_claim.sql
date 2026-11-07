create or replace function public.claim_agent_tool_jobs(
  p_owner_id uuid,
  p_device_id text,
  p_limit integer default 5
)
returns setof public.agent_tool_jobs
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_owner_id is null or p_device_id is null or char_length(p_device_id) < 1 then
    raise exception 'Owner and device identifiers are required';
  end if;

  return query
  with candidates as (
    select j.id
    from public.agent_tool_jobs j
    where j.owner_id = p_owner_id
      and j.device_id = p_device_id
      and j.status = 'queued'
    order by j.requested_at asc
    for update skip locked
    limit least(greatest(coalesce(p_limit, 5), 1), 10)
  )
  update public.agent_tool_jobs j
  set status = 'claimed',
      claimed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

revoke all on function public.claim_agent_tool_jobs(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.claim_agent_tool_jobs(uuid,text,integer) to service_role;
