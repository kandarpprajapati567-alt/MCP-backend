"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

type Agent = {
  id: string;
  name: string;
  provider_preference: string;
  allowed_tools: string[];
  enabled: boolean;
};
type Tool = { id: string; description: string; sideEffect: boolean; permission: string };
type Task = {
  id: string;
  status: string;
  task: string;
  result: string | null;
  error_message?: string;
  failed_stage?: string;
  created_at: string;
};
type SuiteResult = { name: string; status: "passed" | "failed" | "skipped"; detail: string };
type TaskDetail = {
  task: Record<string, unknown>;
  events: Array<{ id: string; event_type: string; payload: Record<string, unknown>; created_at: string }>;
  deviceJobs: Array<Record<string, unknown>>;
};

const examples = [
  { label: "Word count", tool: "text.word_count", prompt: "Count words in: alpha beta gamma delta" },
  { label: "Keyword extraction", tool: "text.extract_keywords", prompt: "Extract keywords from: renewable energy solar power solar panels wind power" },
  { label: "Text statistics", tool: "text.text_stats", prompt: "Text stats for: Futuristic System builds reliable AI agents. Agents use approved tools!" },
];

export default function AgentLabPage() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agentId, setAgentId] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [suiteBusy, setSuiteBusy] = useState(false);
  const [suiteResults, setSuiteResults] = useState<SuiteResult[]>([]);

  async function api(path: string, init: RequestInit = {}) {
    return fetch(path, {
      ...init,
      cache: "no-store",
      headers: {
        "x-fs-owner-token": token,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  }

  async function refresh() {
    const [agentResponse, toolResponse, taskResponse] = await Promise.all([
      api("/api/v1/agents"),
      api("/api/v1/tools"),
      api("/api/v1/agent/tasks"),
    ]);
    const [agentData, toolData, taskData] = await Promise.all([
      agentResponse.json(), toolResponse.json(), taskResponse.json(),
    ]);
    if (!agentResponse.ok || !toolResponse.ok || !taskResponse.ok) {
      throw new Error(agentData.error ?? toolData.error ?? taskData.error ?? "Agent Lab data could not be loaded.");
    }
    const nextAgents = (agentData.agents ?? []) as Agent[];
    setAgents(nextAgents);
    setTools((toolData.tools ?? []) as Tool[]);
    setTasks((taskData.tasks ?? []) as Task[]);
    if (!nextAgents.some((agent) => agent.id === agentId && agent.enabled)) {
      setAgentId(nextAgents.find((agent) => agent.enabled)?.id ?? "");
    }
  }

  async function connect() {
    setBusy(true); setError(""); setMessage("");
    try {
      await refresh();
      setConnected(true);
      setMessage("Agent Lab connected. The owner token stays in this page's memory.");
    } catch (cause) {
      setConnected(false);
      setError(cause instanceof Error ? cause.message : "Connection failed.");
    } finally { setBusy(false); }
  }

  async function runTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage(""); setDetail(null);
    try {
      const response = await api("/api/v1/agent/tasks", {
        method: "POST",
        body: JSON.stringify({ task: taskInput, ...(agentId ? { agentId } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Agent task failed.");
      setMessage(data.status === "completed" ? "Task completed. Inspect the execution trace below." : data.status === "waiting_for_device" ? "Task is waiting for a connected device." : "Task submitted.");
      setTaskInput("");
      await refresh();
      if (data.taskId) await openTask(data.taskId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Task execution failed.");
    } finally { setBusy(false); }
  }

  async function runDeterministicSuite() {
    if (!selectedAgent || selectedAgent.provider_preference !== "mock") {
      setError("Select a Mock-provider Agent before running the no-cost deterministic suite.");
      return;
    }
    setSuiteBusy(true); setSuiteResults([]); setError(""); setMessage("");
    const results: SuiteResult[] = [];
    const checks = [
      { name: "Word count", tool: "text.word_count", prompt: "Count words in: alpha beta gamma delta", verify: (value: unknown) => (value as { wordCount?: number })?.wordCount === 4 },
      { name: "Keyword extraction", tool: "text.extract_keywords", prompt: "Extract keywords from: renewable energy solar power solar panels wind power", verify: (value: unknown) => (value as { keywords?: Array<{ keyword: string; count: number }> })?.keywords?.some((item) => item.keyword === "solar" && item.count === 2) === true },
      { name: "Text statistics", tool: "text.text_stats", prompt: "Text stats for: Futuristic System builds reliable AI agents. Agents use approved tools!", verify: (value: unknown) => {
        const source = "Futuristic System builds reliable AI agents. Agents use approved tools!";
        const stats = value as { characters?: number; words?: number; sentences?: number };
        return stats?.characters === source.length && stats.words === source.trim().split(/\s+/u).length && stats.sentences === 2;
      } },
    ];
    try {
      for (const check of checks) {
        if (!selectedAgent.allowed_tools?.includes(check.tool)) {
          results.push({ name: check.name, status: "skipped", detail: "Tool is not assigned to this Agent." });
          continue;
        }
        const response = await api("/api/v1/agent/tasks", { method: "POST", body: JSON.stringify({ task: check.prompt, agentId: selectedAgent.id }) });
        const data = await response.json();
        const toolResult = Array.isArray(data.toolResults) ? data.toolResults.find((item: { toolId?: string }) => item.toolId === check.tool) : undefined;
        const passed = response.ok && data.status === "completed" && toolResult && check.verify(toolResult.result);
        results.push({ name: check.name, status: passed ? "passed" : "failed", detail: passed ? "Expected tool output verified." : data.error ?? "Expected tool output did not match." });
      }
      const denied = checks.find((check) => !selectedAgent.allowed_tools?.includes(check.tool));
      if (denied) {
        const response = await api("/api/v1/agent/tasks", { method: "POST", body: JSON.stringify({ task: denied.prompt, agentId: selectedAgent.id }) });
        const data = await response.json();
        const passed = !response.ok && data.status === "failed";
        results.push({ name: "Tool permission boundary", status: passed ? "passed" : "failed", detail: passed ? "Unassigned tool request was rejected." : "An unassigned tool request was not rejected as expected." });
      } else {
        results.push({ name: "Tool permission boundary", status: "skipped", detail: "All three local tools are assigned; remove one temporarily to test denial." });
      }
      setSuiteResults(results);
      const passedCount = results.filter((item) => item.status === "passed").length;
      const failedCount = results.filter((item) => item.status === "failed").length;
      setMessage("Deterministic suite finished: " + passedCount + " passed, " + failedCount + " failed, " + results.filter((item) => item.status === "skipped").length + " skipped.");
      await refresh();
    } catch (cause) {
      setSuiteResults(results);
      setError(cause instanceof Error ? cause.message : "Deterministic suite could not complete.");
    } finally { setSuiteBusy(false); }
  }

  async function openTask(id: string) {
    setError("");
    try {
      const response = await api("/api/v1/agent/tasks/" + id);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Task details could not be loaded.");
      setDetail(data as TaskDetail);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Task details unavailable.");
    }
  }

  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === agentId), [agents, agentId]);
  const availableExamples = examples.filter((example) => selectedAgent?.allowed_tools?.includes(example.tool));
  const registeredCount = tools.length;
  const enabledCount = agents.filter((agent) => agent.enabled).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Agent Lab" description="Run real Agent tasks, inspect plans, tool outputs, device jobs and execution events from one testing workspace." />

      {!connected ? (
        <section className="rounded-2xl border border-border bg-zinc-950/70 p-5">
          <h2 className="font-semibold text-white">Secure owner connection</h2>
          <p className="mt-1 text-sm text-zinc-400">Enter the owner master token. It is held only in this page's memory and is not saved to browser storage.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="FS_OWNER_TOKEN" aria-label="Owner master token" className="min-w-0 flex-1 rounded-xl border border-border bg-black/30 px-4 py-3 text-sm text-white" />
            <button type="button" disabled={busy || token.length < 32} onClick={() => void connect()} className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40">{busy ? "Connecting…" : "Open Agent Lab"}</button>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-zinc-950/70 p-4"><p className="text-xs text-zinc-500">Enabled Agents</p><p className="mt-2 text-2xl font-semibold text-white">{enabledCount}</p></div>
            <div className="rounded-2xl border border-border bg-zinc-950/70 p-4"><p className="text-xs text-zinc-500">Registered tools</p><p className="mt-2 text-2xl font-semibold text-white">{registeredCount}</p></div>
            <div className="rounded-2xl border border-border bg-zinc-950/70 p-4"><p className="text-xs text-zinc-500">Recent tasks</p><p className="mt-2 text-2xl font-semibold text-white">{tasks.length}</p></div>
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-zinc-950/70 p-5">
            <div><h2 className="font-semibold text-white">Run an Agent test</h2><p className="mt-1 text-xs text-zinc-500">This calls the same production Agent task pipeline: planning, policy validation, tools, synthesis and persistence.</p></div>
            <form onSubmit={runTask} className="space-y-3">
              <label className="block space-y-1 text-xs text-zinc-400">Agent
                <select value={agentId} onChange={(event) => setAgentId(event.target.value)} className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white">
                  <option value="">Default Agent pipeline</option>
                  {agents.filter((agent) => agent.enabled).map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.provider_preference}</option>)}
                </select>
              </label>
              {selectedAgent && <p className="text-xs text-zinc-500">Assigned tools: {selectedAgent.allowed_tools?.length ? selectedAgent.allowed_tools.join(", ") : "none — this Agent is tool-free"}</p>}
              <label className="block space-y-1 text-xs text-zinc-400">Task / test prompt
                <textarea required minLength={1} maxLength={4000} rows={4} value={taskInput} onChange={(event) => setTaskInput(event.target.value)} placeholder="Describe what you want this Agent to do…" className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy || !taskInput.trim()} className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40">{busy ? "Running…" : "Run Agent test"}</button>
                <button type="button" disabled={busy} onClick={() => void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Refresh failed."))} className="rounded-xl border border-border px-4 py-2.5 text-sm text-zinc-300">Refresh data</button>
              </div>
            </form>
            <div className="border-t border-border pt-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-sm font-semibold text-white">Deterministic test suite</p><p className="mt-1 text-xs text-zinc-500">No-cost checks for local tools and allowlist enforcement. Requires a Mock-provider Agent.</p></div>
                <button type="button" disabled={suiteBusy || busy || !selectedAgent || selectedAgent.provider_preference !== "mock"} onClick={() => void runDeterministicSuite()} className="rounded-xl border border-cyan-800 px-4 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-40">{suiteBusy ? "Running suite…" : "Run safe test suite"}</button>
              </div>
              {suiteResults.length > 0 && <ol className="mt-3 space-y-2">{suiteResults.map((item) => <li key={item.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 p-3"><span className="text-xs text-zinc-200">{item.name}<span className="mt-1 block text-[11px] text-zinc-500">{item.detail}</span></span><span className={"rounded-full px-2.5 py-1 text-[10px] " + (item.status === "passed" ? "bg-emerald-500/15 text-emerald-300" : item.status === "failed" ? "bg-red-500/15 text-red-300" : "bg-zinc-800 text-zinc-400")}>{item.status}</span></li>)}</ol>}
            </div>
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Quick test prompts · requires assigned tool</p>
              <div className="flex flex-wrap gap-2">
                {availableExamples.map((example) => <button key={example.tool} type="button" onClick={() => setTaskInput(example.prompt)} className="rounded-lg border border-cyan-900/60 px-3 py-2 text-xs text-cyan-200">{example.label}</button>)}
                {availableExamples.length === 0 && <p className="text-xs text-zinc-500">Assign text.word_count, text.extract_keywords or text.text_stats in Agent Manager to enable deterministic local-tool examples.</p>}
              </div>
            </div>
            <p className="text-xs text-amber-300/80">Live Agents may call configured AI providers and consume API usage. Tool execution remains limited by each Agent's assigned-tool allowlist.</p>
          </section>

          <section className="space-y-3 rounded-2xl border border-border bg-zinc-950/70 p-5">
            <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-white">Task history</h2><span className="text-xs text-zinc-500">Latest {tasks.length}</span></div>
            {tasks.length === 0 ? <p className="text-sm text-zinc-500">No Agent tests yet. Submit a task above to create the first execution trace.</p> : tasks.map((task) => (
              <button key={task.id} type="button" onClick={() => void openTask(task.id)} className="flex w-full flex-col gap-2 rounded-xl border border-border/80 p-3 text-left hover:border-cyan-800 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0"><span className="block truncate text-sm text-white">{task.task}</span><span className="mt-1 block text-[11px] text-zinc-500">{new Date(task.created_at).toLocaleString()}</span></span>
                <span className={"shrink-0 rounded-full px-3 py-1 text-xs " + (task.status === "completed" ? "bg-emerald-500/15 text-emerald-300" : task.status === "failed" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-200")}>{task.status.replaceAll("_", " ")}</span>
              </button>
            ))}
          </section>

          {detail && (
            <section className="space-y-4 rounded-2xl border border-cyan-900/50 bg-zinc-950/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-white">Execution trace</h2><span className="text-xs text-zinc-500">Task {String(detail.task.id ?? "")}</span></div>
              <div><p className="text-xs text-zinc-500">Input</p><p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">{String(detail.task.task ?? "")}</p></div>
              <div><p className="text-xs text-zinc-500">Status</p><p className="mt-1 text-sm text-white">{String(detail.task.status ?? "unknown")}</p></div>
              <div><p className="text-xs text-zinc-500">Plan</p><pre className="mt-1 max-h-72 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-cyan-100">{JSON.stringify(detail.task.plan ?? null, null, 2)}</pre></div>
              <div><p className="text-xs text-zinc-500">Tool results</p><pre className="mt-1 max-h-72 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-emerald-100">{JSON.stringify(detail.task.tool_results ?? [], null, 2)}</pre></div>
              {detail.task.result && <div><p className="text-xs text-zinc-500">Final result</p><pre className="mt-1 whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-sm text-zinc-200">{String(detail.task.result)}</pre></div>}
              {detail.task.error_code && <p className="text-sm text-red-300">Failure code: {String(detail.task.error_code)}</p>}
              <div><h3 className="mb-2 text-sm font-semibold text-white">Event timeline</h3><ol className="space-y-2">{detail.events.map((event) => <li key={event.id} className="rounded-lg border border-border/70 p-3"><div className="flex flex-wrap justify-between gap-2"><span className="text-xs font-medium text-cyan-200">{event.event_type}</span><span className="text-[10px] text-zinc-500">{new Date(event.created_at).toLocaleString()}</span></div><pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-zinc-400">{JSON.stringify(event.payload, null, 2)}</pre></li>)}</ol></div>
              {detail.deviceJobs.length > 0 && <div><h3 className="mb-2 text-sm font-semibold text-white">Device jobs</h3><pre className="overflow-auto rounded-xl bg-black/40 p-3 text-xs text-zinc-300">{JSON.stringify(detail.deviceJobs, null, 2)}</pre></div>}
            </section>
          )}
        </>
      )}
      {error && <p role="alert" className="rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3 text-sm text-emerald-300">{message}</p>}
    </div>
  );
}
