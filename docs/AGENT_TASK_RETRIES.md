# Safe Agent task retries and execution budgets

## Retry contract

Owner-authenticated endpoint: `POST /api/v1/agent/tasks/{taskId}/retry`.

- A retry creates a new task record. The original failed task and its evidence remain unchanged.
- Only planning-stage failures with `AGENT_EXECUTION_FAILED` or a lease-recovered `AGENT_WORKER_INTERRUPTED` are eligible.
- A recovered worker interruption is retryable only when no plan, tool result, tool activity, device job or cancellation request exists. The lease is expired and fenced before the task is marked failed, so the old worker cannot commit new state.
- The failed attempt must have no persisted plan, tool results, tool activity, device jobs or cancellation request.
- The original Agent configuration snapshot is copied; current Agent edits do not silently change a retry.
- At most two retries are created for one task lineage. Only the latest attempt may be retried.
- Concurrent duplicate requests return the already queued/running retry.
- Tool execution, device dispatch, synthesis and all post-planning failures are never replayed automatically.

Retry lineage uses the existing owner-scoped idempotency key and unique index. Database-backed worker claims require `supabase/migrations/20261115121500_add_agent_task_worker_leases.sql`; it has not been applied to production. The worker records retry origin and attempt in its `task.created` event, followed by a lease-fenced `task.claimed` event.

## Execution budget

| Budget | Default / hard ceiling |
| --- | ---: |
| Planner steps | 8 default; Agent may configure up to 16 |
| Tool calls | 4 default; Agent may configure up to 8 |
| Active execution time | 180 seconds |
| One backend tool result | 16 KiB UTF-8 JSON |
| Aggregate backend tool results | 48 KiB UTF-8 JSON |
| One Android device result | 32 KiB UTF-8 JSON (existing device contract) |
| Synthesis output | 1,800 tokens |

Oversized backend tool outputs are replaced by explicit failure markers, not silently truncated or treated as evidence. Android device-result payloads retain their separate existing 32 KiB per-job contract. Waiting for a paired Android device is not charged against the active execution timer.

## Safety and verification

- Retry is a manual owner action, not an automatic replay loop.
- Queued tasks are claimed atomically with `FOR UPDATE SKIP LOCKED`, a per-task lease token and a 90-second expiry. Heartbeats renew every 20 seconds; task state writes and execution events are fenced by the active worker ID and lease token.
- Expired leases are recovered transactionally as failed or cancelled with an audit event. The system never automatically replays a task after a worker interruption.
- The worker remains in the existing free Render web process. Render suspension can pause processing; a separate paid worker is not required or introduced.
- The retry policy is narrower than provider retry/fallback.
- No production DB migration, data change, paid provider, external side effect or device command is introduced.
- Unit tests cover retry eligibility, lineage keys, plan limits, output limits and deadlines.
- Integration/live verification still requires the Render service and its existing Supabase schema.
