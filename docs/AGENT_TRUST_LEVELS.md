# Agent Trust & Capability Levels (0–999+)

## Purpose

This is a capability and assurance ladder, not a permission ladder. A higher level never grants broader access by itself. Every execution remains constrained by the owner's identity, the agent's explicit tool allowlist, per-tool permissions, data boundaries, budgets, and approval policy.

The level shown in the dashboard is the highest level whose required evidence is currently passing. A failed, stale, or missing required check blocks promotion and is visible to the owner. Never infer a level from model name, prompt quality, token count, or a successful demo.

## Non-negotiable trust invariants

1. Least privilege: deny by default; only registered, owner-enabled tools can execute.
2. Plan validation: parse a versioned plan and validate every call against the registered tool schema before execution.
3. Side-effect gates: destructive, external, financial, messaging, publishing, and device-control actions require explicit scoped authorization. A high level cannot bypass approval.
4. Evidence-first synthesis: distinguish observed tool output, provider-generated claims, and inference. Never fabricate a successful action.
5. Durable audit trail: persist task, plan version, tool-call intent, policy decision, approval, execution result, error, and finalization state.
6. Bounded execution: enforce wall-clock, step, call, output, concurrency, and spend budgets server-side.
7. Recoverability: retries must be idempotent or explicitly marked unsafe; cancellation and partial completion must be represented accurately.
8. Isolation: secrets stay server-side; tool output is untrusted input; prompt injection cannot expand the tool allowlist or override policy.
9. Privacy: owner-scoped reads/writes, minimum data retention, redaction of secrets and sensitive values in logs.
10. Honest degradation: provider outage, mock mode, unavailable tools, stale devices, incomplete work, and verification failures must be explicit.

## Level bands

The numeric scale is intentionally open-ended. Levels are grouped into capability bands; the exact level inside a band is computed from passed controls and evidence, not assigned by configuration.

| Band | Capability | Required proof |
|---|---|---|
| 0–9 | Not certified / inspect-only | No execution claim; health and configuration diagnostics only |
| 10–49 | Deterministic bounded tasks | Strict input validation, registered deterministic tools, bounded output, unit tests |
| 50–99 | Single-agent tool use | Versioned plans, nested schema validation, tool allowlists, structured outcomes, audit events |
| 100–199 | Reliable task lifecycle | Durable task state, idempotency strategy, timeout, cancellation, retry policy, crash recovery |
| 200–299 | Evidence-grounded reasoning | Source/evidence references, provenance labels, verifier checks, contradiction and uncertainty reporting |
| 300–399 | Permissioned autonomy | Risk classification, scoped approvals, policy re-check immediately before side effects, revocation |
| 400–499 | Multi-provider resilience | Provider health, deterministic fallback rules, timeout/circuit breaker, provider/model provenance |
| 500–599 | Multi-agent coordination | Explicit delegation contracts, isolated context, bounded fan-out, result reconciliation, no implicit privilege inheritance |
| 600–699 | Secure integrations | Per-connector credentials, webhook verification, replay protection, tenant/owner isolation, connector conformance tests |
| 700–799 | Adversarial robustness | Prompt-injection corpus, malicious tool-output tests, schema fuzzing, abuse/rate-limit tests, red-team review |
| 800–899 | Production operations | SLOs, metrics, traces, alerting, backup/restore drills, disaster recovery, cost and quota controls |
| 900–998 | Independently verified high assurance | Repeatable end-to-end suites, independent security review, documented threat model, reproducible release evidence |
| 999+ | Continuous assurance frontier | Versioned benchmarks, regression gates, ongoing adversarial evaluation, signed release evidence, monitored rollback; never unlimited autonomy |

## Certification dimensions

Each task/agent/release is assessed separately across: safety and permissions; plan and argument correctness; tool execution integrity; evidence and answer fidelity; lifecycle and recovery; privacy and secret handling; provider resilience; observability and auditability; cost, latency, and resource bounds; adversarial robustness.

A level is blocked if any mandatory safety dimension fails, regardless of average score. Non-safety scores must not compensate for a security failure.



### Current lifecycle hardening in PR #30 (not yet deployed)

- Optional owner-scoped idempotency keys bind one key to a SHA-256 fingerprint of the normalized task and selected Agent. Reusing a key for different work is rejected; repeated matching requests return the existing task.
- Cancellation requests are persisted in the database. Queued and device-waiting tasks can be cancelled immediately; active inline execution checks cancellation between tool calls and before final completion.
- Cancellation cannot interrupt an external provider or tool call that is already in flight. Claimed device jobs may still finish; their results remain auditable and do not revive a cancelled task.
- Both capabilities require their forward Supabase migrations. Their presence in this branch is not proof that the live database has applied them.

### Agent Lab Test Center coverage

The Agent Lab provides an individual **Test** button for each of these checks, plus **Run all tests**:

- Word count, keyword extraction, and text statistics: submit real tasks through the Agent API and assert the returned registered-tool output.
- Tool permission boundary: verify that a tool outside the selected Agent's allowlist is rejected. The check is skipped—not passed—when no unassigned deterministic tool is available.
- Task idempotency: verify matching key/request replay returns the same task, then verify reusing that key with a changed request is rejected.
- Cancellation safety: create a completed test task and verify the cancellation endpoint returns HTTP 409 without changing its terminal status. This is a terminal-state guard test, not an end-to-end proof that an in-flight provider call can be interrupted.

Task-level checks use a Mock-provider Agent and at least one assigned deterministic text tool to avoid paid inference. Each website check displays PASS, FAIL, or SKIPPED with its observed result. The latest report is session-local; it is not yet a versioned certification record. CI unit tests separately cover deterministic tool behavior, idempotency helpers, lifecycle dispositions and cooperative cancellation checkpoints.

### Deterministic synthesis integrity audit

The current Agent result path now runs a deterministic integrity audit after synthesis:
- Counts tool operations and explicit failures.
- Checks answer URLs against URLs present in successful tool output; failed tool output cannot authorize a citation.
- Emits a structural-consistency or warning status and lists concrete warning reasons.
- Always reports **independent truth verification: not performed**. A structurally consistent answer is not a fact-check and does not qualify for the 200–299 evidence-grounded band.

This is an integrity guard, not an independent semantic claim verifier, source-freshness check, contradiction detector, or truth certification. Those remain required work.

## Evidence record

Every certification run should store suite ID/version, agent version, policy version, tool registry version, source commit, deployment identifier, timestamps, environment, each check status (passed/failed/skipped/not applicable), redacted failure details, evidence references, evaluator version, deterministic test seed where applicable, resulting level, previous level, and explicit blockers.

Never store raw credentials, full authorization headers, passkeys, or unredacted private task content in certification artifacts.

## Promotion and downgrade rules

- Promote only after all mandatory checks for the next band pass on the exact candidate commit.
- A skipped check is not a pass. Missing evidence blocks promotion.
- Production certification requires a successful deployed smoke test in addition to CI.
- A critical security regression immediately suspends the affected capability and can downgrade the level.
- A changed model, prompt, tool schema, connector, policy, or runtime invalidates the relevant evidence and triggers re-certification.
- Display the reason for every blocked promotion; never silently label an agent 999+.

## Implementation sequence

1. Preserve and test the existing planner, registered tool catalog, plan parser, sequential executor, synthesis, task history, and device-job finalizer.
2. Add a central policy decision contract and per-tool risk metadata. Enforce the decision at execution time, not only during planning.
3. Add task budgets, idempotency keys, cancellation, retry classification, and stale-task recovery.
4. Add evidence/provenance-aware synthesis and a separate verifier result.
5. Add a certification registry, versioned suites, run history, and dashboard level display.
6. Add provider fallback, connector and multi-agent controls only after the preceding gates are reliable.
7. Add adversarial tests, independent review, operational drills, and release evidence.

## Current implementation baseline (not a certification claim)

Repository inspection found existing modules for agent definitions, planner, plan schema, sequential tool execution, task persistence/events, synthesis, device tool jobs, and finalization. These are useful foundations, but the presence of a module is not proof that the end-to-end system is secure or reliable.

Known constraints observed in the current code include:
- Agent definitions currently support bounded plans of up to 16 steps and 8 registered tool calls; tool calls execute sequentially.
- The local fallback planner recognizes only a small set of text-processing intents; it is not a general-purpose offline planner.
- Task submission still performs planning, backend tool execution and synthesis inline in the API request. The current PR adds optional idempotency keys and cooperative cancellation checkpoints, but a durable background worker, task lease/claim lifecycle, automatic retry policy and full-plan crash recovery remain unimplemented.
- Device tools are discovered from recent online device capability records; capability metadata must be treated as untrusted and validated at the execution boundary.
- Provider mock mode must never be represented as a real model execution.

The current repository must not claim any numeric trust level until executable certification checks and evidence storage are implemented.