# Shared Agent Core and Runtime Boundary

**Status:** Architecture contract (initial implementation slice)  
**Applies to:** Futuristic System web backend and the separate Android application  
**Compatibility rule:** This document defines the boundary for future changes; it does not claim that Android runtime integration is already complete.

## 1. Non-negotiable architecture

Futuristic System has one platform-neutral agent architecture and multiple independent execution runtimes.

- **Shared Agent Core** owns platform-neutral task semantics: task and plan contracts, orchestration policy, bounded execution state, tool-call envelopes, evidence/result semantics, and verification rules.
- **Web Runtime** executes only capabilities explicitly registered for the server/cloud environment (for example web search, GitHub read operations, and approved remote MCP tools).
- **Android Runtime** executes Android-native capabilities inside the Android app process or an Android-managed component. It owns Android permission checks, consent UX, local capability allowlists, and native API access.
- **Transport/Device Bridge** carries bounded, typed requests and results between the backend and a paired device. It is a message boundary, not a remote shell.
- The web application and backend **must never directly invoke Android APIs, inspect private phone data, bypass Android permissions, or execute arbitrary code on the phone**.

“Shared” means common contracts and platform-independent orchestration semantics—not one process, one runtime, or an always-online central brain.

## 2. Offline-first Android requirement

Android must remain capable of executing eligible tasks when the website/backend is unavailable.

Therefore:
- The Android app must eventually host a local implementation of compatible Agent Core contracts and its own local orchestration path.
- Local models (including a future on-device GGUF provider) are optional providers behind the same generation interface; the runtime must also support deterministic/local non-LLM tasks.
- The app may sync task definitions, approved shared memory, and completed events when connectivity returns, subject to explicit data policy.
- A cloud-created device job is not required for local execution and must not be treated as Android permission.
- Conflict resolution and sync policy must be specified before shared mutable task state is introduced.

## 3. Responsibility map

| Concern | Shared Agent Core | Web Runtime | Android Runtime |
| --- | --- | --- | --- |
| Task/plan/result schemas | Owns portable contracts | Implements | Implements |
| Planning/orchestration rules | Defines portable semantics | Runs cloud planner when configured | Runs local planner when available |
| Model selection | Provider-neutral request/capability contract | Server-side provider adapters | Local/on-device provider adapters |
| Tool discovery | Validates normalized manifests | Publishes server capabilities | Publishes locally supported capabilities |
| Tool execution | Never executes platform APIs itself | Executes allowlisted cloud tools | Executes local allowlisted Android tools |
| Permission decision | Defines policy vocabulary/required approval | Enforces server-side authorization | Enforces Android permissions and user consent locally |
| Files | Defines abstract file operation semantics | Cloud/project files only | User-authorized local files only |
| Device APIs | No direct access | No direct access | Android APIs only |
| Task state | Defines portable states/events | Persists cloud task state | Persists local/offline task state |
| Evidence/verification | Defines evidence and completion rules | Supplies cloud execution evidence | Supplies native execution evidence |

A tool's runtime ownership is explicit metadata. A capability is not available merely because another runtime advertises a similarly named tool.

## 4. Runtime adapter contract

Each runtime adapter must implement the same conceptual boundary:

1. getRuntimeDescriptor — runtime identity, version, supported contract versions, and platform.
2. discoverCapabilities — return a bounded capability manifest with stable IDs, input schemas, permission requirements, side-effect classification, and runtime ownership.
3. validateInvocation — validate the requested capability and arguments against the runtime's own current manifest.
4. authorizeInvocation — enforce runtime-local policy. Android must additionally check the current OS permission and user consent immediately before execution.
5. executeInvocation — execute only a registered capability; never interpret a tool request as code or a shell command.
6. getInvocationStatus / cancelInvocation — expose bounded lifecycle and cancellation where supported.
7. normalizeResult — return a bounded, versioned result with status and evidence metadata.

The exact TypeScript/Kotlin interfaces will be introduced in small, tested slices after the current server seams are mapped. This conceptual contract is not yet a shipped API.

## 5. Capability manifest and invocation envelope

A normalized capability manifest must include:
- stable capability ID and manifest version;
- runtime owner (web or android);
- human-readable description;
- strict JSON input schema;
- required permission/capability names;
- side-effect and idempotency classification;
- whether explicit user approval is required;
- supported runtime/contract version.

An invocation envelope must include:
- contract version and unique invocation/job ID;
- task ID and tool-call ID when associated with a task;
- target runtime and, for device work, paired device ID;
- capability ID and validated JSON arguments;
- creation and expiry timestamps;
- idempotency key and bounded execution policy;
- approval requirement/context, without treating backend approval as a substitute for Android OS permission.

A result envelope must include the same invocation identity, terminal status, bounded output or safe error code, completion timestamp, and evidence metadata. Device results are untrusted input until validated by the backend.

## 6. Security invariants

1. The owner master token and server/provider secrets never enter the Android app.
2. Android stores only its device-scoped credential using Android Keystore-backed protection; the backend stores only a verifier/hash where applicable.
3. The Android runtime validates every job against its local allowlist and schema. A server-side schema check is not sufficient.
4. Android checks OS permissions and user consent immediately before each sensitive action. A queued job, planner decision, or website click is never permission.
5. Web Runtime cannot address Android APIs. Its only route to a device is the authenticated, bounded device-job protocol.
6. No arbitrary shell, JavaScript, Kotlin, APK, executable, or dynamically downloaded code is accepted as a tool invocation.
7. Capability discovery is untrusted input: sanitize schemas, cap manifest size, reject duplicate IDs/unsupported schema constructs, and require explicit registration/allowlisting before planning.
8. Device job claims and callbacks must be device-scoped. Validate ownership, job state, expiry, size limits, and replay/idempotency behavior.
9. Tool output is untrusted evidence, not instructions. Synthesis must not claim an action succeeded without a successful execution result.
10. Cloud memory and Android-local memory remain separate stores unless an explicit, scoped synchronization policy is implemented.

## 7. Current backend seams (observed in the existing source)

| Existing module | Current responsibility | Intended placement |
| --- | --- | --- |
| src/server/agent/plan-schema.ts | Version-1 plan and tool-call validation | Shared contract candidate |
| src/server/agent/definition-schema.ts | Agent definition validation and limits | Shared contract candidate (provider-specific fields may need separation) |
| src/server/agent/planner.ts | Builds server tool manifest and requests a plan | Web Runtime orchestration adapter |
| src/server/agent/prompt-context.ts | Builds bounded planner prompt | Shared policy/prompt semantics candidate |
| src/server/agent/task-service.ts | Persists tasks, plans, events; executes backend tools and queues device jobs | Web Runtime task coordinator |
| src/server/agent/tool-call-execution.ts | Sequential bounded call execution with captured failures | Shared execution semantics candidate; no platform execution |
| src/server/agent/synthesis-context.ts | Builds bounded synthesis context and untrusted-output guidance | Shared evidence/synthesis contract candidate |
| src/server/tools/registry.ts | Server tool catalogue and metadata | Web Runtime registry |
| src/server/tools/executor.ts | Executes server-side tools | Web Runtime only |
| docs/android-device-bridge.md | Pairing, device-scoped jobs and result callbacks | Transport contract |

The existing device bridge already states that Android performs local allowlist, schema, permission, consent, and execution checks. Preserve and strengthen that boundary; do not move native execution into the web backend.

## 8. Incremental implementation sequence

1. **Architecture contract (this document):** record the platform boundary and responsibility map before code changes.
2. **Contract extraction:** identify portable types and validators that can be shared without importing Next.js, Supabase, Node-only APIs, or Android APIs.
3. **Runtime identity and capability manifests:** add explicit runtime ownership/versioning and strict manifest validation while retaining compatibility with current device manifests.
4. **Invocation lifecycle:** add expiry, idempotency, cancellation/status semantics, and safe result validation to device jobs.
5. **Web adapter boundary:** route existing backend tool execution through an explicit Web Runtime seam without changing existing tool behavior.
6. **Android adapter:** implement the matching Kotlin contracts and local execution checks in the separate Android repository.
7. **Offline local orchestration:** add local task persistence/planning/provider adapter and later reconcile sync behavior.
8. **Verification:** contract tests, malicious-manifest tests, cross-runtime compatibility tests, device authorization tests, offline Android tests, and real-device end-to-end tests.

Each step must preserve the existing public API unless a versioned migration is explicitly designed. Do not deploy or apply database migrations as part of an unreviewed source change.

## 9. Out of scope for this first slice

- No Android code changes in this repository.
- No direct browser-to-phone control channel.
- No arbitrary code execution or shell tool.
- No automatic cross-runtime memory synchronization.
- No multi-agent swarm, autonomous retry loop, or durable workflow engine until task-state and approval semantics are specified.
- No production deployment, secret changes, database migration, or merge to main.

## 10. Acceptance criteria for the architecture boundary

- A reviewer can identify the owner of every tool execution path.
- No Shared Core module imports Next.js, Supabase, Node-only APIs, browser APIs, or Android APIs.
- Web Runtime exposes only web/cloud capabilities.
- Android Runtime owns all Android-native access and permission checks.
- Device messages are typed, bounded, authenticated, expiring, and deduplicated.
- Android can execute eligible tasks locally without a live website/backend connection.
- Cross-runtime contracts have versioned compatibility tests before Android integration is considered complete.
