# Agent Control Center

The Agents area is the primary owner-facing workspace for creating specialist definitions and running bounded tasks.

## User experience

- **Overview:** task success, persisted tool execution count, evidence coverage, recent tasks and specialist templates.
- **My Agents:** card-based specialist library with role, assigned tools, provider preference, bounded limits, edit, pause, enable and delete actions.
- **Workbench:** plain-language task input, either one selected Agent or Auto Team / Supervisor dispatch.
- **Activity:** persisted task history, final output, tool results, event timeline and device-job records.
- **Test Center:** the existing Agent Lab remains the advanced verification workspace for deterministic task execution, allowlist boundaries, idempotency, cancellation and tool-registry contract checks.

Agent templates are starting configurations, not new permissions. A template can select only tools returned by the current registry. Missing tools are called out. Agents without tools can run only model-only writing/reasoning prompts when a real AI provider is configured; the server rejects source-backed research without source tools.

## Execution and safety contract

- An Agent can call only registered tools included in its saved allowlist.
- Supervisor routing intersects saved allowlists with the current backend, remote-MCP and validated online-device tool inventory before capability matching.
- A role/name match alone does not qualify an Agent for a specialist workstream; at least one matching tool capability is required.
- Plans remain schema-validated and bounded. Auto Team remains capped at three workstreams and the worker remains capped at three concurrent tasks.
- Empty tool output, failed tool calls, failed/cancelled/expired device jobs and empty device payloads cannot be reported as successful tool evidence.
- The Supervisor uses an explicitly configured OpenRouter `:free` planner model only. If it is unavailable, deterministic local decomposition is used; no paid fallback is enabled. The current Supervisor dispatches independent workstreams only; it does not yet persist a dependency graph or shared team-memory context. Dependent steps should be submitted as one task rather than assumed to run in order.
- Side-effect tools remain explicit allowlist choices and continue to be subject to runtime permission checks.

## Performance indicators

The overview reports observations from the latest 50 persisted tasks:
- **Task success:** completed tasks divided by terminal tasks (completed, failed or cancelled).
- **Tool executions:** number of persisted tool result records.
- **Evidence coverage:** completed tasks with at least one persisted tool result divided by all completed tasks.

These are operational indicators, not an independent truth score, model-quality benchmark, or production certification. A model-only completion is explicitly labelled in task events and has no tool evidence; it must not be treated as independently verified.

## Known capability boundary

The current backend tool catalog includes read-only GitHub repository inspection, web search (when Tavily is connected), deterministic text tools, memory/provider information tools and connected-device capabilities. The GitHub tools are read-only; the Repository Analyst template must not claim to edit files, commit changes or deploy. The UI does not add arbitrary shell execution or new external write permissions.

## Verification

The Agent Lab's individual and full test actions remain the supported owner-facing integration test path. Unit tests cover plan validation, local fallback behavior, tool-backed versus model-only execution policy, evidence checks, specialist assignment and registered-tool filtering. This is evaluation-driven quality control, not an autonomous self-modifying or self-training loop. CI/typecheck/build and a deployed smoke test must pass on the candidate commit before calling the release production-ready.
