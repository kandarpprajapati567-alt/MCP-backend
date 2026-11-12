-- Client retries with the same key must resolve to one durable task.
-- A key cannot be reused for a different task or Agent definition.
alter table public.agent_tasks
  add column if not exists idempotency_key text,
  add column if not exists request_fingerprint text;

alter table public.agent_tasks
  add constraint agent_tasks_idempotency_key_check
    check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
  add constraint agent_tasks_request_fingerprint_check
    check (request_fingerprint is null or request_fingerprint ~ '^[a-f0-9]{64}$');

create unique index if not exists agent_tasks_owner_idempotency_key_uidx
  on public.agent_tasks(owner_id, idempotency_key)
  where idempotency_key is not null;
