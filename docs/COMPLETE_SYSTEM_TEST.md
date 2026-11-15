# Complete System Test Center

The dashboard's Complete System Test is a bounded diagnostic surface for the existing Agent, tool, provider, Remote MCP, task and Android-device layers. It reports only the response and contract actually observed.

## Safe Test

Safe Test is the default path and uses owner-authenticated `GET` requests only:

- Website health and database readiness.
- Render backend health.
- Unified backend / Remote MCP / device tool catalog.
- Agent definitions and passive provider configuration.
- GitHub, Web Search and Remote MCP connection status.
- Remote MCP server discovery registry and read-only audit history.
- Android device registry and Agent task history.
- Per-Agent tool-access reports for at most 12 Agent definitions, including assigned, available, allowlisted and denied counts plus the explicit policy that assignment is not a permission grant.

The provider health endpoint is checked for its passive contract (`billingImpact: none` and `vendorConnectivityTested: false`). It does not generate model output or probe vendor connectivity.

If the optional Remote MCP server or audit migration is absent, the corresponding check is `SKIPPED` with the migration requirement shown. The test never applies a migration, creates a connection, invokes a remote tool, changes an Agent, dispatches a device job, or finalizes a task.

## Separately confirmed zero-cost Live Test

Live Test requires a separate browser confirmation and is limited to three Agent tasks per run. It only admits Agents that:

- Are enabled and explicitly configured with the `mock` provider preference.
- Have a non-empty allowlist containing only currently registered `text.*` tools.
- Have every assigned tool explicitly marked read-only.
- Have at least one supported deterministic local text tool (`text.word_count`, `text.extract_keywords` or `text.text_stats`).

The local prompts match the deterministic local planner patterns. OpenAI, OpenRouter, Web Search, GitHub, Remote MCP and Android device tools are never selected by this Live Test. A successful Live result still creates an Agent task and task-history record; it is not a no-write operation. Agents outside the policy are skipped rather than widened automatically.

## Interpretation

- `PASSED` confirms only the exact endpoint or execution assertion shown.
- `FAILED` means the endpoint or expected contract was not verified.
- `SKIPPED` means the check was intentionally not attempted or was unavailable behind an unapplied optional migration.
- Registry availability is not proof of remote reachability, credential validity, Android OS permission, user consent, or real-world correctness.
- A Safe Test pass is not a production certification. Live Agent execution, Android round trips, Remote MCP invocation and external provider connectivity require their own explicitly authorized checks.

No paid service, paid provider, new dependency, production database change or deployment is required by this test center.
