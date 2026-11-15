-- Database-backed task leases prevent duplicate execution across Render instances.
-- This migration is additive and must be reviewed/applied explicitly before deploying code
-- that depends on the lease RPCs. No production database is changed by adding this file.

alter table public.agent_tasks
  add column if not exists worker_id text,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists attempt_count integer not null default 0;

alter table public.agent_tasks
  drop constraint if exists agent_tasks_worker_lease_shape_check,
  drop constraint if exists agent_tasks_worker_id_check,
  drop constraint if exists agent_tasks_attempt_count_check;

alter table public.agent_tasks
  add constraint agent_tasks_worker_id_check
    check (worker_id is null or pg_catalog.char_length(worker_id) between 1 and 128),
  add constraint agent_tasks_attempt_count_check
    check (attempt_count between 0 and 100000),
  add constraint agent_tasks_worker_lease_shape_check
    check (
      (worker_id is null and lease_token is null and lease_expires_at is null)
      or
      (worker_id is not null and lease_token is not null and lease_expires_at is not null)
    );

create index if not exists agent_tasks_owner_active_lease_idx
  on public.agent_tasks(owner_id, lease_expires_at)
  where status in ('planning','executing','synthesizing') and lease_token is not null;

create or replace function public.claim_agent_tasks(
  p_owner_id uuid,
  p_worker_id text,
  p_limit integer default 3,
  p_task_id uuid default null,
  p_lease_seconds integer default 90
)
returns table(
  task_id uuid,
  task text,
  agent_definition_id uuid,
  agent_snapshot jsonb,
  idempotency_key text,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claim_limit integer := case
    when p_task_id is null then greatest(1, least(3, coalesce(p_limit, 3)))
    else 1
  end;
  lease_seconds integer := greatest(30, least(300, coalesce(p_lease_seconds, 90)));
begin
  if p_owner_id is null or p_worker_id is null
    or pg_catalog.char_length(pg_catalog.btrim(p_worker_id)) not between 1 and 128 then
    raise exception 'Valid owner and worker identifiers are required';
  end if;

  return query
  with candidates as (
    select t.id
    from public.agent_tasks as t
    where t.owner_id = p_owner_id
      and t.status = 'queued'
      and t.cancellation_requested_at is null
      and (p_task_id is null or t.id = p_task_id)
    order by t.created_at asc
    for update skip locked
    limit claim_limit
  ),
  claimed as (
    update public.agent_tasks as t
    set status = 'planning',
        worker_id = p_worker_id,
        lease_token = pg_catalog.gen_random_uuid(),
        lease_expires_at = pg_catalog.now() + (lease_seconds * interval '1 second'),
        last_heartbeat_at = pg_catalog.now(),
        attempt_count = t.attempt_count + 1,
        updated_at = pg_catalog.now()
    from candidates as c
    where t.id = c.id
      and t.owner_id = p_owner_id
      and t.status = 'queued'
      and t.cancellation_requested_at is null
    returning t.id, t.task, t.agent_definition_id, t.agent_snapshot,
      t.idempotency_key, t.lease_token, t.lease_expires_at, t.attempt_count
  ),
  logged as (
    insert into public.agent_task_events(task_id, owner_id, event_type, payload)
    select c.id, p_owner_id, 'task.claimed',
      pg_catalog.jsonb_build_object(
        'workerId', p_worker_id,
        'attempt', c.attempt_count,
        'leaseExpiresAt', c.lease_expires_at
      )
    from claimed as c
    returning task_id
  )
  select c.id, c.task, c.agent_definition_id, c.agent_snapshot,
    c.idempotency_key, c.lease_token, c.lease_expires_at, c.attempt_count
  from claimed as c;
end;
$$;

create or replace function public.renew_agent_task_lease(
  p_owner_id uuid,
  p_task_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_seconds integer default 90
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lease_seconds integer := greatest(30, least(300, coalesce(p_lease_seconds, 90)));
begin
  update public.agent_tasks as t
  set lease_expires_at = pg_catalog.now() + (lease_seconds * interval '1 second'),
      last_heartbeat_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where t.owner_id = p_owner_id
    and t.id = p_task_id
    and t.worker_id = p_worker_id
    and t.lease_token = p_lease_token
    and t.lease_expires_at > pg_catalog.now()
    and t.status in ('planning','executing','synthesizing')
    and t.cancellation_requested_at is null;

  return found;
end;
$$;

create or replace function public.append_agent_task_event(
  p_owner_id uuid,
  p_task_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1
  from public.agent_tasks as t
  where t.owner_id = p_owner_id
    and t.id = p_task_id
    and t.worker_id = p_worker_id
    and t.lease_token = p_lease_token
    and t.lease_expires_at > pg_catalog.now()
    and t.status in ('planning','executing','synthesizing')
    and t.cancellation_requested_at is null
  for update;

  if not found then return false; end if;

  insert into public.agent_task_events(task_id, owner_id, event_type, payload)
  values (
    p_task_id,
    p_owner_id,
    p_event_type,
    case when pg_catalog.jsonb_typeof(p_payload) = 'object' then p_payload else '{}'::jsonb end
  );

  return true;
end;
$$;

create or replace function public.finish_agent_task(
  p_owner_id uuid,
  p_task_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_status text,
  p_result text,
  p_error_code text,
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_status text;
  cancellation_requested_at timestamptz;
  finish_event text;
begin
  if p_status not in ('completed','failed','cancelled') then
    raise exception 'Unsupported terminal task status';
  end if;

  select t.status, t.cancellation_requested_at
  into current_status, cancellation_requested_at
  from public.agent_tasks as t
  where t.owner_id = p_owner_id
    and t.id = p_task_id
    and t.worker_id = p_worker_id
    and t.lease_token = p_lease_token
    and t.lease_expires_at > pg_catalog.now()
  for update;

  if not found or current_status not in ('planning','executing','synthesizing') then
    return false;
  end if;
  if p_status = 'completed' and cancellation_requested_at is not null then return false; end if;
  if p_status = 'failed' and cancellation_requested_at is not null then return false; end if;
  if p_status = 'cancelled' and cancellation_requested_at is null then return false; end if;

  finish_event := case p_status
    when 'completed' then 'task.completed'
    when 'failed' then 'task.failed'
    else 'task.cancelled'
  end;

  update public.agent_tasks as t
  set status = p_status,
      result = p_result,
      error_code = case when p_error_code is null then null else pg_catalog.left(p_error_code, 80) end,
      completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now(),
      worker_id = null,
      lease_token = null,
      lease_expires_at = null,
      last_heartbeat_at = pg_catalog.now()
  where t.owner_id = p_owner_id and t.id = p_task_id;

  insert into public.agent_task_events(task_id, owner_id, event_type, payload)
  values (
    p_task_id,
    p_owner_id,
    finish_event,
    case when pg_catalog.jsonb_typeof(p_payload) = 'object' then p_payload else '{}'::jsonb end
  );

  return true;
end;
$$;

create or replace function public.recover_expired_agent_task_leases(
  p_owner_id uuid,
  p_limit integer default 25
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  recovered_count integer := 0;
begin
  if p_owner_id is null then raise exception 'Owner identifier is required'; end if;

  with expired as (
    select t.id, t.owner_id, t.status as previous_status, t.worker_id, t.cancellation_requested_at
    from public.agent_tasks as t
    where t.owner_id = p_owner_id
      and t.status in ('planning','executing','synthesizing')
      and t.lease_token is not null
      and t.lease_expires_at <= pg_catalog.now()
    order by t.lease_expires_at asc
    for update skip locked
    limit greatest(1, least(100, coalesce(p_limit, 25)))
  ),
  recovered as (
    update public.agent_tasks as t
    set status = case when e.cancellation_requested_at is not null then 'cancelled' else 'failed' end,
        error_code = case when e.cancellation_requested_at is not null then 'AGENT_TASK_CANCELLED' else 'AGENT_WORKER_INTERRUPTED' end,
        completed_at = pg_catalog.now(),
        updated_at = pg_catalog.now(),
        worker_id = null,
        lease_token = null,
        lease_expires_at = null,
        last_heartbeat_at = pg_catalog.now()
    from expired as e
    where t.id = e.id and t.owner_id = e.owner_id
    returning t.id, t.owner_id, t.status, e.previous_status, e.worker_id
  ),
  logged as (
    insert into public.agent_task_events(task_id, owner_id, event_type, payload)
    select r.id, r.owner_id,
      case when r.status = 'cancelled' then 'task.cancelled' else 'task.failed' end,
      pg_catalog.jsonb_build_object(
        'code', case when r.status = 'cancelled' then 'AGENT_TASK_CANCELLED' else 'AGENT_WORKER_INTERRUPTED' end,
        'stage', r.previous_status,
        'workerId', r.worker_id,
        'automaticReplay', false,
        'message', case
          when r.status = 'cancelled' then 'The worker lease expired after cancellation was requested; the task was marked cancelled.'
          else 'The worker lease expired. The task was not replayed because execution may have crossed a side-effect boundary.'
        end
      )
    from recovered as r
    returning id
  )
  select pg_catalog.count(*) into recovered_count from logged;

  return recovered_count;
end;
$$;

revoke all on function public.claim_agent_tasks(uuid,text,integer,uuid,integer) from public, anon, authenticated;
revoke all on function public.renew_agent_task_lease(uuid,uuid,text,uuid,integer) from public, anon, authenticated;
revoke all on function public.append_agent_task_event(uuid,uuid,text,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.finish_agent_task(uuid,uuid,text,uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.recover_expired_agent_task_leases(uuid,integer) from public, anon, authenticated;

grant execute on function public.claim_agent_tasks(uuid,text,integer,uuid,integer) to service_role;
grant execute on function public.renew_agent_task_lease(uuid,uuid,text,uuid,integer) to service_role;
grant execute on function public.append_agent_task_event(uuid,uuid,text,uuid,text,jsonb) to service_role;
grant execute on function public.finish_agent_task(uuid,uuid,text,uuid,text,text,text,jsonb) to service_role;
grant execute on function public.recover_expired_agent_task_leases(uuid,integer) to service_role;
