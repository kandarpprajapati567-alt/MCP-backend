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
