"use client";

import { useState } from "react";

type Props = { token: string; agents: Array<{ id: string; name: string; enabled: boolean }> };
type TestResult = { id: string; status: "passed" | "failed"; detail: string };
type DispatchResult = {
  status: string;
  teamRunId?: string;
  teamResult?: string;
  teamStatus?: string;
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
  const [copied, setCopied] = useState("");

  async function copyOutput(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Clipboard access was blocked by the browser. Select and copy the visible output manually.");
    }
  }

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
    if (initial.teamRunId) {
      const terminalTeam = new Set(["completed", "partial", "needs_review", "failed"]);
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const response = await request("/api/v1/agent/teams/" + initial.teamRunId, "POST");
          if (!response.ok) continue;
          const team = await response.json() as { status?: string; result?: string; members?: Array<{ subtaskId?: string; status?: string; result?: string; error?: string; errorCode?: string }> };
          setResult((current) => current ? ({
            ...current,
            teamStatus: team.status,
            teamResult: typeof team.result === "string" ? team.result : current.teamResult,
            assignments: current.assignments?.map((assignment) => {
              const member = team.members?.find((item) => item.subtaskId === assignment.subtaskId);
              return member ? { ...assignment, status: member.status ?? assignment.status, result: member.result ?? assignment.result, error: member.error ?? assignment.error, errorCode: member.errorCode ?? assignment.errorCode } : assignment;
            }),
          }) : current);
          if (terminalTeam.has(team.status ?? "")) return;
        } catch { /* Retry the next bounded poll. */ }
      }
      setError((current) => current || "Team tasks are still running. Their individual task records remain available in Task History.");
      return;
    }
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
      const response = await request("/api/v1/agent/supervisor/run", "POST", { goal: acceptanceGoal }, { "Idempotency-Key": crypto.randomUUID() });
      const data = await response.json() as DispatchResult;
      setResult(data);
      if (!response.ok && response.status !== 207 && response.status !== 202) {
        setError(data.error ?? "Live execution acceptance test could not be queued.");
        return;
      }
      if (data.status === "failed" || data.status === "partial" || data.status === "needs_review") setError(data.error ?? "The live acceptance test needs review before it can be treated as successful.");
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
      if (data.status === "failed" || data.status === "partial" || data.status === "needs_review") setError(data.error ?? "Some subtasks failed or need evidence review. Inspect each assignment below.");
      void monitorExecution(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Supervisor could not process the goal.");
    } finally { setBusy(false); }
  }

  const fullOutput = result ? [
    `Team Run: ${result.teamRunId ?? "not created"}`,
    `Status: ${result.teamStatus ?? result.status}`,
    `Planner: ${result.planner ?? "unknown"}`,
    `Summary: ${result.summary ?? ""}`,
    ...(result.assignments ?? []).map((item) => `\nAgent: ${item.agentName}\nStatus: ${item.status}\nTask: ${item.taskId ?? "n/a"}\nResult: ${item.result ?? "No result yet"}\nError: ${item.error ?? "None"}`),
    `\nCombined result:\n${result.teamResult ?? "Not available yet"}`,
  ].join("\n") : "";

  return (
    <section className="agent-command-console space-y-4 rounded-2xl border border-violet-700/60 bg-gradient-to-br from-violet-950/40 via-zinc-950 to-cyan-950/25 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-300">Stage 02 · Orchestration</p>
          <h2 className="mt-1 text-xl font-bold text-white">Supervisor Command</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-300">Ek goal likho. Supervisor use specialist agents mein divide karke persistent worker queue mein bhejega.</p>
        </div>
        <span className="rounded-full border border-violet-500/60 bg-violet-950 px-3 py-2 text-xs font-semibold text-violet-100">{agents.filter((agent) => agent.enabled).length} agents online</span>
      </div>

      <form onSubmit={dispatchGoal} className="space-y-3 rounded-xl border border-white/10 bg-black/35 p-3 sm:p-4">
        <label className="block space-y-2 text-sm font-semibold text-white">Your command / goal
          <textarea required minLength={1} maxLength={4000} rows={5} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Example: Research, design and test a student task management REST API..." className="w-full rounded-xl border-2 border-violet-500/60 bg-zinc-950 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-500 focus:border-violet-300 focus:ring-2 focus:ring-violet-500/30" />
        </label>
        <button type="submit" disabled={busy || !goal.trim() || agents.filter((agent) => agent.enabled).length === 0} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-violet-300 px-5 py-3 text-base font-extrabold text-zinc-950 shadow-lg shadow-violet-950/40 hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-45">
          <span aria-hidden="true">▶</span>{busy ? "RUNNING · PLANNING & ASSIGNING…" : "RUN SUPERVISOR COMMAND"}
        </button>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" disabled={testing || busy} onClick={() => void runTests()} className="min-h-11 rounded-xl border border-cyan-500/60 bg-cyan-950/60 px-4 py-2.5 text-sm font-bold text-cyan-100 hover:bg-cyan-900 disabled:opacity-40">{testing ? "Testing stages…" : "Test Stage 2 & 3"}</button>
          <button type="button" disabled={busy || testing} onClick={() => void runLiveAcceptanceTest()} className="min-h-11 rounded-xl border border-emerald-500/60 bg-emerald-950/60 px-4 py-2.5 text-sm font-bold text-emerald-100 hover:bg-emerald-900 disabled:opacity-40">Run Live Execution Test</button>
        </div>
      </form>

      {testSummary && <div className="rounded-xl border border-cyan-700/60 bg-cyan-950/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-white">Diagnostics · {testSummary}</p><button type="button" onClick={() => void copyOutput("tests", tests.map((item) => `${item.status.toUpperCase()} · ${item.id} · ${item.detail}`).join("\n"))} className="rounded-lg border border-cyan-600 px-3 py-2 text-xs font-bold text-cyan-100">{copied === "tests" ? "Copied ✓" : "Copy test report"}</button></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{tests.map((item) => <div key={item.id} className="rounded-lg border border-white/10 bg-black/30 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-zinc-100">{item.id.replace(/_/g, " ")}</p><span className={item.status === "passed" ? "rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-200" : "rounded bg-red-500/20 px-2 py-1 text-[10px] font-bold text-red-200"}>{item.status.toUpperCase()}</span></div><p className="mt-2 text-xs leading-5 text-zinc-300">{item.detail}</p></div>)}</div>
      </div>}

      {result && <section aria-live="polite" className="space-y-3 rounded-xl border-2 border-emerald-500/50 bg-zinc-950 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Execution output</p><h3 className="text-base font-bold text-white">Your Agent Team Result</h3></div><button type="button" onClick={() => void copyOutput("all", fullOutput)} className="min-h-10 rounded-lg bg-emerald-300 px-4 py-2 text-xs font-extrabold text-zinc-950">{copied === "all" ? "COPIED ✓" : "COPY ALL OUTPUT"}</button></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-black/50 p-3"><p className="text-[10px] uppercase text-zinc-500">Team run ID</p><p className="mt-1 break-all font-mono text-xs text-cyan-200">{result.teamRunId ?? "Not created"}</p></div>
          <div className="rounded-lg bg-black/50 p-3"><p className="text-[10px] uppercase text-zinc-500">Overall status</p><p className="mt-1 text-sm font-bold uppercase text-amber-200">{result.teamStatus ?? result.status}</p></div>
        </div>
        {result.summary && <div className="rounded-lg bg-black/40 p-3"><p className="text-xs font-bold text-zinc-200">Supervisor plan</p><p className="mt-1 text-sm leading-6 text-zinc-300">{result.summary}</p><p className="mt-2 text-[10px] text-zinc-500">Planner: {result.planner ?? "unknown"}</p></div>}
        {result.plan?.subtasks.map((task) => {
          const assignment = result.assignments?.find((item) => item.subtaskId === task.id);
          const label = "agent-" + task.id;
          return <article key={task.id} className="rounded-xl border border-violet-500/30 bg-violet-950/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-white">{task.title}</h4><span className="rounded-md bg-violet-400/15 px-2 py-1 text-[10px] font-bold text-violet-200">{assignment?.agentName ?? "Unassigned"}</span></div>
            <p className="mt-2 text-xs leading-5 text-zinc-300">{task.objective}</p>
            <p className="mt-2 text-[10px] text-zinc-500">Capabilities: {task.requiredCapabilities.join(", ") || "general"}</p>
            {assignment && <div className="mt-3 rounded-lg bg-black/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold uppercase text-cyan-200">Agent status: {assignment.status.replaceAll("_", " ")}</span>{assignment.taskId && <span className="text-[10px] text-zinc-500">Task {assignment.taskId.slice(0, 8)}</span>}</div>
              <p className="mt-1 text-[10px] leading-5 text-zinc-400">Match: {assignment.reason}{assignment.errorCode ? " · " + assignment.errorCode : ""}</p>
              {assignment.result ? <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-emerald-200">Agent output</p><button type="button" onClick={() => void copyOutput(label, assignment.result ?? "")} className="rounded-md border border-emerald-600/60 px-3 py-1.5 text-[10px] font-bold text-emerald-100">{copied === label ? "Copied ✓" : "Copy output"}</button></div><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-emerald-50">{assignment.result}</pre></div> : <p className="mt-2 text-xs text-amber-200">Output abhi available nahi hai — agent ka status complete hone ka wait karo.</p>}
              {assignment.error && <p className="mt-2 rounded-lg bg-red-950/40 p-2 text-xs leading-5 text-red-200">Error: {assignment.error}</p>}
            </div>}
          </article>;
        })}
        {result.teamResult && <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/25 p-3"><div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-sm font-bold text-emerald-200">Combined team output</h4><button type="button" onClick={() => void copyOutput("combined", result.teamResult ?? "")} className="rounded-lg border border-emerald-500/60 px-3 py-2 text-xs font-bold text-emerald-100">{copied === "combined" ? "Copied ✓" : "Copy result"}</button></div><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-white">{result.teamResult}</pre></div>}
      </section>}

      {error && <p role="alert" className="rounded-lg border border-red-700 bg-red-950/50 p-3 text-sm leading-6 text-red-100">{error}</p>}
      <p className="text-[10px] leading-5 text-zinc-500">Supervisor max 3 subtasks / 3 workers. Uses configured OpenRouter :free model only, otherwise deterministic local planning. Diagnostics are deterministic; goal checks are not semantic truth verification. Live Execution Test uses the Mock provider and no AI credits.</p>
    </section>
  );
}
