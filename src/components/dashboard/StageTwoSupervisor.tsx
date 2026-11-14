"use client";

import { useState } from "react";

type Props = { token: string; agents: Array<{ id: string; name: string; enabled: boolean }> };
type TestResult = { id: string; status: "passed" | "failed"; detail: string };
type DispatchResult = {
  status: string;
  summary?: string;
  planner?: string;
  plan?: { subtasks: Array<{ id: string; title: string; objective: string; requiredCapabilities: string[] }> };
  assignments?: Array<{ subtaskId: string; agentId: string; agentName: string; objective: string; taskId?: string; status: string; reason: string; error?: string; result?: string; errorCode?: string }>;
  error?: string;
};

export function StageTwoSupervisor({ token, agents }: Props) {
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [tests, setTests] = useState<TestResult[]>([]);
  const [testSummary, setTestSummary] = useState("");

  async function request(path: string, method: "GET" | "POST", body?: unknown, extraHeaders: Record<string, string> = {}) {
    return fetch(path, {
      method,
      cache: "no-store",
      headers: { "x-fs-owner-token": token, ...(body ? { "Content-Type": "application/json" } : {}), ...extraHeaders },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60000),
    });
  }

  async function monitorExecution(initial: DispatchResult) {
    const taskIds = (initial.assignments ?? []).flatMap((item) => item.taskId ? [item.taskId] : []);
    if (!taskIds.length) return;
    const terminal = new Set(["completed", "failed", "cancelled"]);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const snapshots = await Promise.all(taskIds.map(async (taskId) => {
        try {
          const response = await request("/api/v1/agent/tasks/" + taskId, "GET");
          if (!response.ok) return null;
          const payload = await response.json() as {
            task?: { id?: string; status?: string; result?: unknown; error_code?: string };
            events?: Array<{ event_type?: string; payload?: { message?: unknown } }>;
          };
          if (!payload.task?.id) return null;
          const failedEvent = payload.events?.find((event) => event.event_type === "tool.failed");
          const failureMessage = typeof failedEvent?.payload?.message === "string" ? failedEvent.payload.message : undefined;
          return { ...payload.task, failureMessage };
        } catch { return null; }
      }));
      const latest = new Map(snapshots.filter((item): item is NonNullable<typeof item> => Boolean(item?.id)).map((item) => [item.id as string, item]));
      if (latest.size) {
        setResult((current) => current ? ({
          ...current,
          assignments: current.assignments?.map((assignment) => {
            const task = assignment.taskId ? latest.get(assignment.taskId) : undefined;
            if (!task) return assignment;
            return {
              ...assignment,
              status: task.status ?? assignment.status,
              result: typeof task.result === "string" ? task.result : assignment.result,
              errorCode: task.error_code ?? assignment.errorCode,
              error: task.failureMessage ?? assignment.error,
            };
          }),
        }) : current);
      }
      if (taskIds.every((id) => {
        const task = latest.get(id);
        return Boolean(task && terminal.has(task.status ?? ""));
      })) return;
    }
    setError((current) => current || "Tasks were queued, but the live monitor reached its 2-minute window. Check Task History for the latest persisted status.");
  }

  async function runTests() {
    setTesting(true); setTests([]); setTestSummary(""); setError("");
    try {
      const response = await request("/api/v1/agent/supervisor/test", "POST");
      const data = await response.json();
      const rows = Array.isArray(data.results) ? data.results as TestResult[] : [];
      setTests(rows);
      const summary = data.summary;
      setTestSummary(summary ? `${summary.passed} passed · ${summary.failed} failed · ${summary.total} total` : "Test response was incomplete.");
      if (!response.ok || data.status !== "passed") setError(data.error ?? "One or more Stage 2 checks failed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Stage 2 test could not complete.");
      setTestSummary("Test request failed.");
    } finally { setTesting(false); }
  }

  async function runLiveAcceptanceTest() {
    const acceptanceGoal = "Count words in: alpha beta gamma delta";
    setGoal(acceptanceGoal);
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await request(
        "/api/v1/agent/supervisor/run",
        "POST",
        { goal: acceptanceGoal },
        { "Idempotency-Key": crypto.randomUUID() },
      );
      const data = await response.json() as DispatchResult;
      setResult(data);
      if (!response.ok && response.status !== 207 && response.status !== 202) {
        setError(data.error ?? "Live execution acceptance test could not be queued.");
        return;
      }
      if (data.status === "failed" || data.status === "partial") {
        setError(data.error ?? "The live acceptance test was only partially queued.");
      } else {
        setError("");
      }
      void monitorExecution(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Live execution acceptance test failed.");
    } finally { setBusy(false); }
  }

  async function dispatchGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await request("/api/v1/agent/supervisor/run", "POST", { goal }, { "Idempotency-Key": crypto.randomUUID() });
      const data = await response.json() as DispatchResult;
      setResult(data);
      if (!response.ok && response.status !== 207 && response.status !== 202) {
        setError(data.error ?? "Supervisor dispatch failed. The server rejected the run.");
        return;
      }
      if (data.status === "failed" || data.status === "partial") {
        setError(data.error ?? "Some planned subtasks could not be queued. Review each assignment below.");
      } else {
        setError("");
      }
      void monitorExecution(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Supervisor could not process the goal.");
    } finally { setBusy(false); }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-violet-800/50 bg-gradient-to-br from-violet-950/30 via-zinc-950/90 to-cyan-950/20 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-violet-300">Stage 02 · Orchestration</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Supervisor Command</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-400">One goal in, bounded workstreams out. Supervisor plans, capability matching selects enabled specialists, and assigned tasks enter the existing persistent worker queue.</p>
        </div>
        <span className="rounded-full border border-violet-700/50 px-3 py-1 text-[10px] text-violet-200">{agents.filter((agent) => agent.enabled).length} enabled agents</span>
      </div>

      <form onSubmit={dispatchGoal} className="space-y-3">
        <label className="block space-y-1 text-xs text-zinc-300">Overall goal
          <textarea required minLength={1} maxLength={4000} rows={4} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Example: Research official Android background execution guidance; analyze how it affects our app; prepare an implementation brief." className="w-full rounded-xl border border-border bg-black/35 px-3 py-3 text-sm text-white" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy || !goal.trim() || agents.filter((agent) => agent.enabled).length === 0} className="rounded-xl bg-violet-300 px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40">{busy ? "Planning & assigning…" : "Run Supervisor"}</button>
          <button type="button" disabled={testing || busy} onClick={() => void runTests()} className="rounded-xl border border-cyan-700/70 bg-cyan-950/30 px-5 py-2.5 text-sm font-semibold text-cyan-100 disabled:opacity-40">{testing ? "Testing Stage 2…" : "Test Stage 2"}</button>
          <button type="button" disabled={busy || testing} onClick={() => void runLiveAcceptanceTest()} className="rounded-xl border border-emerald-700/70 bg-emerald-950/30 px-5 py-2.5 text-sm font-semibold text-emerald-100 disabled:opacity-40">Run Live Execution Test</button>
        </div>
      </form>

      {testSummary && <div className="rounded-xl border border-border bg-black/25 p-3"><p className="text-xs font-semibold text-white">Stage 2 diagnostics · {testSummary}</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{tests.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg bg-black/25 p-2"><div><p className="text-xs text-zinc-200">{item.id.replace(/_/g, " ")}</p><p className="mt-1 text-[10px] text-zinc-500">{item.detail}</p></div><span className={item.status === "passed" ? "text-[10px] font-bold text-emerald-300" : "text-[10px] font-bold text-red-300"}>{item.status.toUpperCase()}</span></div>)}</div></div>}

      {result?.plan && <div className="space-y-3 rounded-xl border border-border bg-black/25 p-4">
        <div><p className="text-xs font-semibold text-white">Supervisor plan</p><p className="mt-1 text-xs text-zinc-400">{result.summary} · planner: {result.planner ?? "unknown"}</p></div>
        {result.plan.subtasks.map((task) => {
          const assignment = result.assignments?.find((item) => item.subtaskId === task.id);
          return <article key={task.id} className="rounded-lg border border-white/10 bg-black/25 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-white">{task.title}</p><span className="text-[10px] text-cyan-200">{assignment?.agentName ?? "Unassigned"}</span></div>
            <p className="mt-1 text-xs text-zinc-400">{task.objective}</p>
            <p className="mt-2 text-[10px] text-zinc-500">Capabilities: {task.requiredCapabilities.join(", ") || "general"}</p>
            {assignment && <p className="mt-1 text-[10px] text-zinc-500">Match: {assignment.reason} · Status: {assignment.status}{assignment.taskId ? " · Task " + assignment.taskId : ""}{assignment.errorCode ? " · " + assignment.errorCode : ""}</p>}
            {assignment?.error && <p className="mt-1 text-xs text-red-300">{assignment.error}</p>}
            {assignment?.result && <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 text-[11px] text-emerald-100">{assignment.result}</pre>}
          </article>;
        })}
      </div>}

      {error && <p role="alert" className="rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-200">{error}</p>}
      <p className="text-[10px] text-zinc-500">Stage 2 is bounded to three subtasks and the existing three-worker limit. Supervisor uses an explicitly configured OpenRouter :free model only; it never falls back to a paid provider. Without one, it uses zero-cost deterministic local decomposition. Test Stage 2 runs deterministic module checks plus live read-only Agent registry and queue checks. Run Live Execution Test creates one deterministic word-count task, routes it through the Supervisor and persistent worker, and uses the Mock provider with no AI credits.</p>
    </section>
  );
}
