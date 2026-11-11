# Bot System — Foundation

## Responsibility split

- **Bot:** user-facing identity, persona, default model preference, assigned Agent roster, and conversation history.
- **Agent:** specialist instructions, provider/model preference, bounded planner policy, tool allowlist, and execution limits.
- **Model router:** resolves provider/model requests using the existing encrypted provider configuration and usage policy.
- **Tool registry/executor:** the existing allow-listed tool surface remains the only execution path.

Bots do not execute tools directly and cannot expand an Agent's permissions. A Bot-level tool allowlist is intersected with the selected Agent's allowlist; an empty Bot allowlist inherits the Agent's configured tools.

## Initial interaction flow

1. Owner creates a Bot and assigns one or more enabled Agents.
2. Owner configures persona instructions, provider/model defaults, optional tool restrictions, and an optional default Agent.
3. A conversation message selects the explicit Agent, the Bot default Agent, or the only assigned Agent when exactly one exists.
4. The Bot passes its persona and narrower tool policy into the existing Agent task runtime.
5. The Agent planner, policy validation, tool executor, synthesis, task events, and task history remain authoritative.
6. User and assistant messages, conversation metadata, and the Agent task ID are persisted.

When multiple Agents are assigned and no default exists, the caller must select an Agent. Automatic intent-based multi-Agent routing and coordinated multi-Agent workflows are intentionally deferred; the first slice keeps routing explicit and auditable.

## Owner APIs

- GET/POST /api/v1/bots — list and create Bot definitions.
- PATCH/DELETE /api/v1/bots/:botId — update, pause/resume, and delete a Bot.
- POST /api/v1/bots/:botId/messages — send a message and delegate to an assigned Agent.
- GET /api/v1/bots/:botId/conversations — list saved conversations.
- GET /api/v1/bots/:botId/messages?conversationId=:id — load persisted messages.

All routes require the existing owner-token authentication. Bot tables have RLS enabled and direct access revoked from anon/authenticated roles; the server uses the service role only after owner verification.

## Database

Apply supabase/migrations/20261111130000_create_bot_system.sql after the Agent Manager migration. It creates Bot definitions, conversations, and messages. It is additive and does not alter existing Agent or task records.

## Verification

The Bot definition schema tests are included in npm test. Typecheck and production build must pass in CI before merging. After the migration is applied, verify Bot create/update/pause/delete, assignment enforcement, Bot-level tool restriction, conversation persistence/reload, and task-history linkage with an owner-authenticated session.