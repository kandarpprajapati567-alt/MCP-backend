-- Persist deterministic evaluations and distinguish partial / review outcomes from success.
alter table public.agent_tasks
  add column if not exists completion_evaluation jsonb,
  add column if not exists goal_evaluation jsonb;

alter table public.agent_tasks
  drop constraint if exists agent_tasks_status_check;
alter table public.agent_tasks
  add constraint agent_tasks_status_check
  check (status = any (array[
    'queued','planning','awaiting_approval','waiting_for_device','executing',
    'synthesizing','completed','partial','needs_review','failed','cancelled'
  ]));

alter table public.agent_task_events
  drop constraint if exists agent_task_events_event_type_check;
alter table public.agent_task_events
  add constraint agent_task_events_event_type_check
  check (event_type = any (array[
    'task.created','task.planning','task.plan_ready','task.executing',
    'tool.requested','tool.claimed','tool.completed','tool.failed',
    'task.synthesizing','task.completed','task.partial','task.needs_review',
    'task.failed','task.cancelled','task.cancellation_requested',
    'device.registered','device.heartbeat',
    'memory.created','memory.updated','memory.deleted'
  ]));

-- Evaluated non-success outcomes are terminal and must not accept cancellation.
create or replace function public.request_agent_task_cancellation(
  p_owner_id uuid,
  p_task_id uuid
)
returns table(task_id uuid, status text, cancellation_requested_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_status text;
  requested_at timestamptz := pg_catalog.now();
begin
  if p_owner_id is null or p_task_id is null then
    raise exception 'Owner and task identifiers are required';
  end if;

  select t.status into current_status
  from public.agent_tasks t
  where t.owner_id = p_owner_id and t.id = p_task_id
  for update;

  if not found then
    return;
  end if;

  if current_status in ('completed', 'partial', 'needs_review', 'failed', 'cancelled') then
    return query
      select t.id, t.status, t.cancellation_requested_at
      from public.agent_tasks t
      where t.owner_id = p_owner_id and t.id = p_task_id;
    return;
  end if;

  if current_status in ('queued', 'awaiting_approval', 'waiting_for_device') then
    update public.agent_tasks t
    set status = 'cancelled',
        cancellation_requested_at = coalesce(t.cancellation_requested_at, requested_at),
        completed_at = coalesce(t.completed_at, requested_at),
        updated_at = requested_at
    where t.owner_id = p_owner_id and t.id = p_task_id;

    update public.agent_tool_jobs j
    set status = 'cancelled',
        completed_at = coalesce(j.completed_at, requested_at),
        updated_at = requested_at
    where j.owner_id = p_owner_id
      and j.task_id = p_task_id
      and j.status = 'queued';
  else
    update public.agent_tasks t
    set cancellation_requested_at = coalesce(t.cancellation_requested_at, requested_at),
        updated_at = requested_at
    where t.owner_id = p_owner_id and t.id = p_task_id;
  end if;

  return query
    select t.id, t.status, t.cancellation_requested_at
    from public.agent_tasks t
    where t.owner_id = p_owner_id and t.id = p_task_id;
end;
$$;

revoke all on function public.request_agent_task_cancellation(uuid,uuid) from public, anon, authenticated;
grant execute on function public.request_agent_task_cancellation(uuid,uuid) to service_role;
