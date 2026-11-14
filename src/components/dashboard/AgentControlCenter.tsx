"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StageTwoSupervisor } from "@/components/dashboard/StageTwoSupervisor";

type Agent = {
  id: string;
  name: string;
  description: string;
  role: string;
  instructions: string;
  provider_preference: string;
  model_preference: string | null;
  allowed_tools: string[];
  max_steps: number;
  max_tool_calls: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};
type Tool = { id: string; description: string; sideEffect: boolean; permission?: string };
type Task = {
  id: string;
  status: string;
  task: string;
  result: string | null;
  error_code?: string | null;
  error_message?: string;
  failed_stage?: string;
  tool_results?: Array<{ toolId?: string; result?: unknown }>;
  plan?: { toolCalls?: Array<{ toolId?: string }> } | null;
  agent_snapshot?: { name?: string; role?: string } | null;
  created_at: string;
  completed_at?: string | null;
};
type TaskDetail = {
  task: Record<string, unknown>;
  events: Array<{ id: string; event_type: string; payload: Record<string, unknown>; created_at: string }>;
  deviceJobs: Array<Record<string, unknown>>;
};
type Draft = {
  name: string;
  description: string;
  role: string;
  instructions: string;
  providerPreference: string;
  modelPreference: string;
  maxSteps: number;
  maxToolCalls: number;
  enabled: boolean;
  allowedTools: string[];
};
type Template = {
  id: string;
  name: string;
  role: string;
  description: string;
  instructions: string;
  tools: string[];
  icon: string;
  tone: string;
};

const templates: Template[] = [
  {
    id: "research",
    name: "Research Specialist",
    role: "Research analyst",
    description: "Finds and organizes information from connected research sources.",
    instructions: "Research the user's request using only assigned, registered tools. Keep source URLs and distinguish retrieved evidence from assumptions. If a source tool is unavailable, say so clearly.",
    tools: ["web.search", "github.list_files", "github.read_file", "github.list_commits"],
    icon: "⌕",
    tone: "border-sky-400/25 bg-sky-400/[.06]",
  },
  {
    id: "repository",
    name: "Repository Analyst",
    role: "Software repository analyst",
    description: "Inspects repository files, branches and commits. Read-only access.",
    instructions: "Inspect only the connected repository through assigned GitHub read tools. Cite exact paths and observed code. Do not claim to modify files, commit, or deploy; this Agent has read-only repository access.",
    tools: ["github.list_branches", "github.list_commits", "github.list_files", "github.read_file"],
    icon: "⌘",
    tone: "border-violet-400/25 bg-violet-400/[.06]",
  },
  {
    id: "text",
    name: "Text & Data Analyst",
    role: "Text analysis specialist",
    description: "Runs deterministic word counts, keyword extraction and text statistics.",
    instructions: "Process only the text supplied by the user. Use assigned deterministic text tools where relevant. Report exact returned values and do not invent missing data.",
    tools: ["text.word_count", "text.extract_keywords", "text.text_stats"],
    icon: "▤",
    tone: "border-emerald-400/25 bg-emerald-400/[.06]",
  },
  {
    id: "custom",
    name: "Custom Specialist",
    role: "General specialist",
    description: "Define a focused role and choose exactly which registered tools it can use.",
    instructions: "Follow the user's objective, use only assigned registered tools, and clearly separate tool evidence from generated interpretation.",
    tools: [],
    icon: "✳",
    tone: "border-amber-400/25 bg-amber-400/[.06]",
  },
];

const blankDraft: Draft = {
  name: "",
  description: "",
  role: "",
  instructions: "",
  providerPreference: "auto",
  modelPreference: "",
  maxSteps: 8,
  maxToolCalls: 4,
  enabled: true,
  allowedTools: [],
};

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "agents", label: "My Agents" },
  { id: "workbench", label: "Workbench" },
  { id: "activity", label: "Activity" },
] as const;
type Tab = (typeof tabs)[number]["id"];

function statusTone(status: string) {
  if (status === "completed") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (status === "failed" || status === "cancelled") return "border-rose-400/25 bg-rose-400/10 text-rose-300";
  return "border-amber-400/25 bg-amber-400/10 text-amber-200";
}

function toolCount(task: Task) {
  return Array.isArray(task.tool_results) ? task.tool_results.length : 0;
}

export default function AgentControlCenter() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedAgentId, setSelectedAgentId] = useState("auto");
  const [taskInput, setTaskInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [runInfo, setRunInfo] = useState<{ status: string; summary?: string; assignments?: Array<{ agentName: string; status: string; taskId?: string; error?: string }> } | null>(null);

  async function api(path: string, init: RequestInit = {}) {
    return fetch(path, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "x-fs-owner-token": token,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  }

  async function loadData() {
    const [agentResponse, toolResponse, taskResponse] = await Promise.all([
      api("/api/v1/agents"),
      api("/api/v1/tools"),
      api("/api/v1/agent/tasks"),
    ]);
    const [agentData, toolData, taskData] = await Promise.all([
      agentResponse.json(), toolResponse.json(), taskResponse.json(),
    ]);
    if (!agentResponse.ok || !toolResponse.ok || !taskResponse.ok) {
      throw new Error(agentData.error ?? toolData.error ?? taskData.error ?? "Agent data could not be loaded.");
    }
    const nextAgents = (agentData.agents ?? []) as Agent[];
    setAgents(nextAgents);
    setTools((toolData.tools ?? []).filter((tool: Tool) => tool.id !== "device.dispatch_tool" && !tool.id.startsWith("agent.")));
    setTasks((taskData.tasks ?? []) as Task[]);
    if (selectedAgentId !== "auto" && !nextAgents.some((agent) => agent.id === selectedAgentId && agent.enabled)) {
      setSelectedAgentId("auto");
    }
  }

  async function connect() {
    setLoading(true);
    setError("");
    try {
      await loadData();
      setConnected(true);
      setNotice("Connected. Your Agent definitions and task history are ready.");
    } catch (cause) {
      setConnected(false);
      setError(cause instanceof Error ? cause.message : "Secure connection failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/v1/session", { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.json())
      .then((session: { authenticated?: boolean }) => {
        if (active && session.authenticated) void connect();
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  function startCreate(templateId = "custom") {
    const template = templates.find((item) => item.id === templateId) ?? templates[3];
    const selected = template.tools.filter((id) => tools.some((tool) => tool.id === id));
    setEditingId(null);
    setDraft({
      ...blankDraft,
      name: template.id === "custom" ? "" : template.name,
      role: template.role,
      description: template.description,
      instructions: template.instructions,
      allowedTools: selected.length ? selected : tools.filter((tool) => !tool.sideEffect).map((tool) => tool.id),
    });
    setShowEditor(true);
    setError("");
    setNotice(template.id !== "custom" && selected.length < template.tools.length
      ? "Some tools required by this template are not currently registered. Review its Allowed tools before saving; an Agent without tools cannot execute tasks."
      : "");
  }

  function startEdit(agent: Agent) {
    setEditingId(agent.id);
    setDraft({
      name: agent.name,
      description: agent.description ?? "",
      role: agent.role,
      instructions: agent.instructions,
      providerPreference: agent.provider_preference,
      modelPreference: agent.model_preference ?? "",
      maxSteps: agent.max_steps,
      maxToolCalls: agent.max_tool_calls,
      enabled: agent.enabled,
      allowedTools: agent.allowed_tools ?? [],
    });
    setShowEditor(true);
    setError("");
    setNotice("");
  }

  async function saveAgent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await api(editingId ? "/api/v1/agents/" + editingId : "/api/v1/agents", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({
          ...draft,
          modelPreference: draft.modelPreference.trim() || null,
          allowedTools: draft.allowedTools,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Agent could not be saved.");
      await loadData();
      setShowEditor(false);
      setEditingId(null);
      setNotice(editingId ? "Agent updated." : "Agent created.");
      setActiveTab("agents");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAgent(agent: Agent) {
    setBusy(true);
    setError("");
    try {
      const response = await api("/api/v1/agents/" + agent.id, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !agent.enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Agent status could not be changed.");
      await loadData();
      setNotice(agent.name + (agent.enabled ? " paused." : " enabled."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent status could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAgent(agent: Agent) {
    if (!window.confirm("Delete " + agent.name + "? Existing task history is kept.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await api("/api/v1/agents/" + agent.id, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Agent could not be deleted.");
      await loadData();
      setNotice(agent.name + " deleted. Existing task history remains available.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  async function openTask(taskId: string) {
    setError("");
    try {
      const response = await api("/api/v1/agent/tasks/" + taskId);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Task details could not be loaded.");
      setDetail(data as TaskDetail);
      setActiveTab("activity");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Task details unavailable.");
    }
  }

  async function runTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskInput.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    setDetail(null);
    setRunInfo(null);
    try {
      const supervisorMode = selectedAgentId === "auto";
      const response = supervisorMode
        ? await api("/api/v1/agent/supervisor/run", {
            method: "POST",
            headers: { "Idempotency-Key": crypto.randomUUID() },
            body: JSON.stringify({ goal: taskInput.trim() }),
          })
        : await api("/api/v1/agent/tasks", {
            method: "POST",
            headers: { "Idempotency-Key": crypto.randomUUID() },
            body: JSON.stringify({ task: taskInput.trim(), agentId: selectedAgentId }),
          });
      const data = await response.json();
      if (!response.ok && response.status !== 202 && response.status !== 207) {
        throw new Error(data.error ?? "The task could not be started.");
      }
      if (supervisorMode) {
        setRunInfo({
          status: data.status ?? "queued",
          summary: data.summary,
          assignments: data.assignments ?? [],
        });
      } else if (typeof data.taskId === "string") {
        setRunInfo({ status: data.status ?? "queued", summary: "Task accepted by " + (agents.find((item) => item.id === selectedAgentId)?.name ?? "Agent") + ".", assignments: [{ agentName: agents.find((item) => item.id === selectedAgentId)?.name ?? "Agent", status: data.status ?? "queued", taskId: data.taskId }] });
      } else {
        setRunInfo({ status: data.status ?? "accepted", summary: data.message ?? "Task accepted." });
      }
      setNotice(supervisorMode ? "Supervisor accepted your goal. Workstreams are being monitored below." : "Your Agent accepted the task. Live task status is shown below.");
      setTaskInput("");
      await loadData();
      const taskIds: string[] = supervisorMode
        ? (data.assignments ?? []).flatMap((item: { taskId?: string }) => item.taskId ? [item.taskId] : [])
        : typeof data.taskId === "string" ? [data.taskId] : [];
      if (taskIds.length) {
        for (let attempt = 0; attempt < 45; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await loadData().catch(() => undefined);
          const snapshots = await Promise.all(taskIds.map(async (id) => {
            try {
              const statusResponse = await api("/api/v1/agent/tasks/" + id);
              if (!statusResponse.ok) return null;
              const payload = await statusResponse.json();
              return payload.task as { id: string; status: string; result?: string | null; error_code?: string | null } | undefined;
            } catch { return null; }
          }));
          const latest = snapshots.filter((item): item is NonNullable<typeof item> => Boolean(item?.id));
          if (latest.length) {
            setRunInfo((current) => current ? ({
              ...current,
              status: latest.every((item) => item.status === "completed") ? "completed"
                : latest.some((item) => item.status === "failed") ? "failed"
                  : latest.some((item) => item.status === "completed") ? "partial" : "running",
              assignments: current.assignments?.map((assignment) => {
                const snapshot = assignment.taskId ? latest.find((item) => item.id === assignment.taskId) : undefined;
                return snapshot ? { ...assignment, status: snapshot.status } : assignment;
              }),
            }) : current);
          }
          if (latest.length === taskIds.length && latest.every((item) => ["completed", "failed", "cancelled"].includes(item.status))) break;
        }
        await loadData().catch(() => undefined);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent task failed.");
    } finally {
      setBusy(false);
    }
  }

  const enabledAgents = agents.filter((agent) => agent.enabled);
  const terminalTasks = tasks.filter((task) => ["completed", "failed", "cancelled"].includes(task.status));
  const completedTasks = tasks.filter((task) => task.status === "completed");
  const failedTasks = tasks.filter((task) => task.status === "failed");
  const toolExecutions = tasks.reduce((sum, task) => sum + toolCount(task), 0);
  const evidenceTasks = completedTasks.filter((task) => toolCount(task) > 0).length;
  const successRate = terminalTasks.length ? Math.round((completedTasks.length / terminalTasks.length) * 100) : null;
  const evidenceCoverage = completedTasks.length ? Math.round((evidenceTasks / completedTasks.length) * 100) : null;
  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === selectedAgentId), [agents, selectedAgentId]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Agent Control Center"
        description="Choose a specialist, give it a task, and track what it actually executed."
      />

      {!connected ? (
        <section className="rounded-3xl border border-border bg-zinc-950/80 p-6 sm:p-8">
          <div className="mx-auto max-w-xl text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-2xl text-cyan-200">✳</div>
            <h2 className="mt-4 text-lg font-semibold text-white">Connect your private Agent workspace</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Your owner session is checked automatically. If it is not active, enter the owner token to load your Agents and execution history.</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="FS_OWNER_TOKEN" aria-label="Owner master token" className="min-w-0 flex-1 rounded-xl border border-border bg-black/30 px-4 py-3 text-sm text-white" />
              <button type="button" disabled={loading || token.length < 32} onClick={() => void connect()} className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40">{loading ? "Connecting…" : "Connect workspace"}</button>
            </div>
            {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
          </div>
        </section>
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-zinc-950/70 p-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
              <div><p className="text-sm font-semibold text-white">Workspace connected</p><p className="text-[11px] text-zinc-500">{enabledAgents.length} active specialists · {tools.length} registered tools · {tasks.length} recent tasks</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={loading || busy} onClick={() => { setLoading(true); void loadData().then(() => setNotice("Workspace refreshed.")).catch((cause) => setError(cause instanceof Error ? cause.message : "Refresh failed.")).finally(() => setLoading(false)); }} className="rounded-xl border border-border px-3 py-2 text-xs text-zinc-300 disabled:opacity-40">{loading ? "Refreshing…" : "Refresh"}</button>
              <button type="button" onClick={() => startCreate()} className="rounded-xl bg-cyan-300 px-4 py-2 text-xs font-semibold text-zinc-950">+ New Agent</button>
            </div>
          </section>

          <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-zinc-950/60 p-1.5" aria-label="Agent workspace sections">
            {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={"shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold transition " + (activeTab === tab.id ? "bg-cyan-300 text-zinc-950" : "text-zinc-400 hover:bg-white/5 hover:text-white")}>{tab.label}</button>)}
          </nav>

          {activeTab === "overview" && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Active Agents" value={enabledAgents.length} hint={agents.length + " saved"} />
                <MetricCard label="Task success" value={successRate === null ? "—" : successRate + "%"} hint={terminalTasks.length + " terminal tasks in latest 50"} />
                <MetricCard label="Tool executions" value={toolExecutions} hint="Persisted tool outputs" />
                <MetricCard label="Evidence coverage" value={evidenceCoverage === null ? "—" : evidenceCoverage + "%"} hint={completedTasks.length + " completed tasks checked"} />
              </div>

              <section className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/30 via-zinc-950 to-violet-950/20 p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-cyan-200">Start working</p><h2 className="mt-2 text-xl font-semibold text-white">What should your Agents do?</h2><p className="mt-1 text-sm text-zinc-400">Write the task in plain language. Auto Team can split it into up to three bounded workstreams.</p></div>
                  <span className="rounded-full border border-cyan-300/20 px-3 py-1 text-[10px] text-cyan-100">Simple workbench</span>
                </div>
                <form onSubmit={runTask} className="mt-5 space-y-3">
                  <textarea value={taskInput} onChange={(event) => setTaskInput(event.target.value)} maxLength={4000} rows={3} placeholder="Example: Research the latest Android background execution rules and prepare a short summary…" className="w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-cyan-400/50" />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <select value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm text-white">
                      <option value="auto">Auto Team · choose specialists for me</option>
                      {enabledAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.role}</option>)}
                    </select>
                    <button type="submit" disabled={busy || !taskInput.trim() || (selectedAgentId === "auto" && enabledAgents.length === 0) || (selectedAgentId !== "auto" && Boolean(selectedAgent && (selectedAgent.allowed_tools ?? []).length === 0))} className="rounded-xl bg-cyan-300 px-6 py-3 text-sm font-bold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Working…" : "Run task →"}</button>
                  </div>
                  {selectedAgent && <p className="text-[11px] text-zinc-500">Selected specialist: {selectedAgent.name} · {(selectedAgent.allowed_tools ?? []).length} assigned tools</p>}
                  {selectedAgent && (selectedAgent.allowed_tools ?? []).length === 0 && <p role="alert" className="text-xs text-amber-200">This Agent has no assigned tools yet. Edit its card and assign at least one registered tool before running a task.</p>}
                </form>
                {runInfo && <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-white">Execution monitor</p><span className={"rounded-full border px-2.5 py-1 text-[10px] " + statusTone(runInfo.status)}>{runInfo.status.replaceAll("_", " ")}</span></div>
                  {runInfo.summary && <p className="mt-2 text-xs text-zinc-400">{runInfo.summary}</p>}
                  {runInfo.assignments?.map((item, index) => <div key={item.taskId ?? item.agentName + index} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[.07] p-3"><span className="text-xs text-zinc-200">{item.agentName}</span><span className={"text-[10px] " + (item.status === "completed" ? "text-emerald-300" : item.status === "failed" ? "text-rose-300" : "text-amber-200")}>{item.status.replaceAll("_", " ")}</span>{item.error && <p className="w-full text-xs text-rose-300">{item.error}</p>}</div>)}
                </div>}
              </section>

              <div className="grid gap-4 xl:grid-cols-[1.35fr_.85fr]">
                <section className="rounded-3xl border border-border bg-zinc-950/70 p-5">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[.18em] text-zinc-500">Specialists</p><h2 className="mt-1 text-base font-semibold text-white">Your Agents</h2></div><button type="button" onClick={() => setActiveTab("agents")} className="text-xs text-cyan-200">View all →</button></div>
                  {agents.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{agents.slice(0, 4).map((agent) => <AgentCard key={agent.id} agent={agent} busy={busy} onRun={() => { setSelectedAgentId(agent.id); setActiveTab("workbench"); }} onEdit={() => startEdit(agent)} onToggle={() => void toggleAgent(agent)} />)}</div> : <EmptyState title="No Agents yet" description="Start with a ready-made specialist card. You can customize its tools and behavior later." action="Create first Agent" onAction={() => startCreate("research")} /> }
                </section>
                <section className="rounded-3xl border border-border bg-zinc-950/70 p-5">
                  <div className="flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-zinc-500">Recent activity</p><h2 className="mt-1 text-base font-semibold text-white">Latest tasks</h2></div><button type="button" onClick={() => setActiveTab("activity")} className="text-xs text-cyan-200">History →</button></div>
                  <div className="mt-4 space-y-2">{tasks.slice(0, 5).map((task) => <button key={task.id} type="button" onClick={() => void openTask(task.id)} className="w-full rounded-xl border border-white/[.07] p-3 text-left hover:border-cyan-400/30"><span className="block truncate text-xs text-zinc-200">{task.task}</span><span className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] text-zinc-500">{new Date(task.created_at).toLocaleString()}</span><span className={"rounded-full border px-2 py-0.5 text-[9px] " + statusTone(task.status)}>{task.status.replaceAll("_", " ")}</span></span></button>)}
                    {!tasks.length && <p className="text-xs text-zinc-500">Your completed and running tasks will appear here.</p>}
                  </div>
                </section>
              </div>

              <section className="rounded-3xl border border-border bg-zinc-950/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[.18em] text-zinc-500">Build your team</p><h2 className="mt-1 text-base font-semibold text-white">Start with a specialist template</h2></div><button type="button" onClick={() => setActiveTab("agents")} className="text-xs text-cyan-200">Manage Agents →</button></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{templates.map((template) => <TemplateCard key={template.id} template={template} onChoose={() => startCreate(template.id)} />)}</div>
              </section>
              <div className="grid gap-3 sm:grid-cols-2">
                <Link href="/dashboard/agent-lab" className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[.04] p-5 transition hover:border-cyan-300/40"><p className="text-[10px] uppercase tracking-[.18em] text-cyan-200">Quality & regression</p><h3 className="mt-2 text-sm font-semibold text-white">Agent Test Center ↗</h3><p className="mt-1 text-xs leading-5 text-zinc-400">Run all deterministic checks, verify tool permissions, test task lifecycle and inspect real execution traces.</p></Link>
                <Link href="/dashboard/agent-map" className="rounded-2xl border border-border bg-zinc-950/70 p-5 transition hover:border-cyan-300/30"><p className="text-[10px] uppercase tracking-[.18em] text-zinc-500">System architecture</p><h3 className="mt-2 text-sm font-semibold text-white">Agent Architecture ↗</h3><p className="mt-1 text-xs leading-5 text-zinc-400">Understand how Supervisor, specialist Agents, tool permissions and the persistent task queue connect.</p></Link>
              </div>
            </div>
          )}

          {activeTab === "agents" && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[.18em] text-zinc-500">Specialist library</p><h2 className="mt-1 text-xl font-semibold text-white">My Agents</h2><p className="mt-1 text-sm text-zinc-400">Each card is one saved Agent with its own role, provider preference and tool permissions.</p></div><button type="button" onClick={() => startCreate()} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-bold text-zinc-950">+ Create Agent</button></div>
              {agents.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{agents.map((agent) => <AgentCard key={agent.id} agent={agent} busy={busy} onRun={() => { setSelectedAgentId(agent.id); setActiveTab("workbench"); }} onEdit={() => startEdit(agent)} onToggle={() => void toggleAgent(agent)} onDelete={() => void deleteAgent(agent)} />)}</div> : <EmptyState title="Your Agent library is empty" description="Choose a template below. It will create a persistent Agent definition in your private backend." action="Create a Research Agent" onAction={() => startCreate("research")} />}
              <div className="rounded-3xl border border-border bg-zinc-950/70 p-5"><h3 className="text-sm font-semibold text-white">Specialist templates</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{templates.map((template) => <TemplateCard key={template.id} template={template} onChoose={() => startCreate(template.id)} />)}</div></div>
            </div>
          )}

          {activeTab === "workbench" && (
            <div className="space-y-5">
              <section className="rounded-3xl border border-border bg-zinc-950/70 p-5 sm:p-6">
                <p className="text-[10px] uppercase tracking-[.18em] text-cyan-200">Task workbench</p><h2 className="mt-1 text-xl font-semibold text-white">Give your Agent a job</h2><p className="mt-1 text-sm text-zinc-400">Use Auto Team for capability-based delegation or choose one specialist.</p>
                <form onSubmit={runTask} className="mt-5 space-y-3">
                  <textarea required value={taskInput} onChange={(event) => setTaskInput(event.target.value)} maxLength={4000} rows={4} placeholder="Describe the result you want in everyday language…" className="w-full rounded-2xl border border-border bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-cyan-400/50" />
                  <div className="flex flex-col gap-3 sm:flex-row"><select value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-border bg-zinc-900 px-3 py-3 text-sm text-white"><option value="auto">Auto Team · let Supervisor choose</option>{enabledAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.role}</option>)}</select><button type="submit" disabled={busy || !taskInput.trim() || (selectedAgentId === "auto" && enabledAgents.length === 0) || (selectedAgentId !== "auto" && Boolean(selectedAgent && (selectedAgent.allowed_tools ?? []).length === 0))} className="rounded-xl bg-cyan-300 px-6 py-3 text-sm font-bold text-zinc-950 disabled:opacity-40">{busy ? "Working…" : "Start task →"}</button></div>
                </form>
                {runInfo && <div className="mt-4 rounded-2xl border border-border p-4"><div className="flex justify-between gap-2"><b className="text-sm text-white">Latest run</b><span className={"rounded-full border px-2 py-1 text-[10px] " + statusTone(runInfo.status)}>{runInfo.status}</span></div>{runInfo.summary && <p className="mt-2 text-xs text-zinc-400">{runInfo.summary}</p>}{runInfo.assignments?.map((item,index)=><div key={item.taskId ?? item.agentName+index} className="mt-2 rounded-xl bg-black/25 p-3 text-xs"><div className="flex justify-between gap-2"><span className="text-zinc-200">{item.agentName}</span><span className="text-zinc-400">{item.status}</span></div>{item.error && <p className="mt-1 text-rose-300">{item.error}</p>}</div>)}</div>}
              </section>
              <StageTwoSupervisor token={token} agents={agents.map((agent) => ({ id: agent.id, name: agent.name, enabled: agent.enabled }))} />
              <div className="grid gap-3 sm:grid-cols-2"><Link href="/dashboard/agent-lab" className="rounded-2xl border border-border bg-zinc-950/70 p-5 hover:border-cyan-400/30"><p className="text-[10px] uppercase tracking-[.18em] text-zinc-500">Verification</p><h3 className="mt-2 text-sm font-semibold text-white">Agent Test Center ↗</h3><p className="mt-1 text-xs leading-5 text-zinc-400">Run deterministic task checks, permission tests, cancellation checks and inspect execution traces.</p></Link><Link href="/dashboard/agent-map" className="rounded-2xl border border-border bg-zinc-950/70 p-5 hover:border-cyan-400/30"><p className="text-[10px] uppercase tracking-[.18em] text-zinc-500">Architecture</p><h3 className="mt-2 text-sm font-semibold text-white">Agent Architecture ↗</h3><p className="mt-1 text-xs leading-5 text-zinc-400">View the planner, specialists, policy gates and persistent task flow.</p></Link></div>
            </div>
          )}

          {activeTab === "activity" && (
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <section className="rounded-3xl border border-border bg-zinc-950/70 p-5"><div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold text-white">Execution history</h2><span className="text-[10px] text-zinc-500">Latest {tasks.length}</span></div><div className="mt-4 space-y-2">{tasks.map((task) => <button key={task.id} type="button" onClick={() => void openTask(task.id)} className="w-full rounded-xl border border-border/70 p-3 text-left hover:border-cyan-400/30"><div className="flex items-start justify-between gap-3"><span className="min-w-0 text-xs text-zinc-200">{task.task}</span><span className={"shrink-0 rounded-full border px-2 py-1 text-[9px] " + statusTone(task.status)}>{task.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-[10px] text-zinc-500">{task.agent_snapshot?.name ?? "Auto / default"} · {toolCount(task)} tool result(s) · {new Date(task.created_at).toLocaleString()}</p></button>)}{!tasks.length && <p className="text-xs text-zinc-500">No tasks yet.</p>}</div></section>
              <section className="rounded-3xl border border-border bg-zinc-950/70 p-5"><h2 className="text-base font-semibold text-white">Execution evidence</h2>{detail ? <><div className="mt-3 flex items-center justify-between gap-2"><p className="text-xs text-zinc-400">Task result</p><span className={"rounded-full border px-2 py-1 text-[9px] " + statusTone(String(detail.task.status ?? "unknown"))}>{String(detail.task.status ?? "unknown")}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">{String(detail.task.task ?? "")}</p>{typeof detail.task.result === "string" && <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/40 p-3 text-xs text-emerald-100">{detail.task.result}</pre>}{typeof detail.task.error_code === "string" && <p className="mt-2 text-xs text-rose-300">Failure: {detail.task.error_code}</p>}<div className="mt-4"><h3 className="text-xs font-semibold text-white">Tool outputs</h3><pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-black/40 p-3 text-[10px] text-zinc-300">{JSON.stringify(detail.task.tool_results ?? [], null, 2)}</pre></div><div className="mt-4"><h3 className="text-xs font-semibold text-white">Event timeline</h3><div className="mt-2 space-y-2">{detail.events.map((event) => <article key={event.id} className="rounded-xl border border-border/70 p-3"><div className="flex justify-between gap-2"><span className="text-[10px] text-cyan-200">{event.event_type}</span><span className="text-[9px] text-zinc-600">{new Date(event.created_at).toLocaleString()}</span></div><pre className="mt-2 whitespace-pre-wrap break-words text-[10px] text-zinc-400">{JSON.stringify(event.payload, null, 2)}</pre></article>)}</div></div>{detail.deviceJobs.length > 0 && <div className="mt-4"><h3 className="text-xs font-semibold text-white">Device jobs</h3><pre className="mt-2 max-h-52 overflow-auto rounded-xl bg-black/40 p-3 text-[10px] text-zinc-300">{JSON.stringify(detail.deviceJobs, null, 2)}</pre></div>}</> : <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center"><p className="text-sm text-zinc-300">Select a task to inspect its evidence.</p><p className="mt-1 text-xs text-zinc-500">Plans, tool outputs, task events and device jobs are shown here.</p></div>}</section>
            </div>
          )}
        </>
      )}

      {showEditor && connected && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-3 pt-8 backdrop-blur-sm sm:p-8"><form onSubmit={saveAgent} className="my-auto w-full max-w-2xl space-y-4 rounded-3xl border border-cyan-400/20 bg-zinc-950 p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[.18em] text-cyan-200">{editingId ? "Edit specialist" : "Create specialist"}</p><h2 className="mt-1 text-xl font-semibold text-white">{editingId ? "Update Agent" : "New Agent card"}</h2><p className="mt-1 text-xs text-zinc-500">Start with a clear role. Advanced controls can stay at their safe defaults.</p></div><button type="button" onClick={() => setShowEditor(false)} className="rounded-lg border border-border px-3 py-2 text-xs text-zinc-400">Close</button></div>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Agent name"><input required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Research Specialist" className="w-full rounded-xl border border-border bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50" /></Field><Field label="Specialist role"><input required maxLength={120} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} placeholder="Research analyst" className="w-full rounded-xl border border-border bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50" /></Field></div>
        <Field label="What should this Agent do?"><input maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="A short description of its responsibility" className="w-full rounded-xl border border-border bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50" /></Field>
        <Field label="Instructions"><textarea required maxLength={12000} rows={4} value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} placeholder="Describe its job, boundaries and expected output…" className="w-full rounded-xl border border-border bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50" /></Field>
        <details className="rounded-2xl border border-border bg-black/20 p-4"><summary className="cursor-pointer text-sm font-semibold text-zinc-200">Advanced settings · tools, provider and limits</summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Provider preference"><select value={draft.providerPreference} onChange={(event) => setDraft({ ...draft, providerPreference: event.target.value })} className="w-full rounded-xl border border-border bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50"><option value="auto">Automatic routing</option><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option><option value="mock">Mock · deterministic tests</option></select></Field><Field label="Preferred model (optional)"><input maxLength={160} value={draft.modelPreference} onChange={(event) => setDraft({ ...draft, modelPreference: event.target.value })} placeholder="Leave blank for routing policy" className="w-full rounded-xl border border-border bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50" /></Field><Field label="Maximum planning steps"><select value={draft.maxSteps} onChange={(event) => setDraft({ ...draft, maxSteps: Number(event.target.value) })} className="w-full rounded-xl border border-border bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50">{[1,2,3,4,5,6,8,10,12,16].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field><Field label="Maximum tool calls"><select value={draft.maxToolCalls} onChange={(event) => setDraft({ ...draft, maxToolCalls: Number(event.target.value) })} className="w-full rounded-xl border border-border bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50">{[0,1,2,3,4,5,6,8].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field></div>
          <div className="mt-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-zinc-200">Allowed tools · {draft.allowedTools.length} selected</p><button type="button" onClick={() => setDraft({ ...draft, allowedTools: tools.filter((tool) => !tool.sideEffect).map((tool) => tool.id) })} className="text-[10px] text-cyan-200">Select safe read-only tools</button></div><p className="mt-1 text-[10px] text-zinc-500">Only these registered tools can be called by this Agent. Side-effect tools are never selected automatically.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{tools.map((tool) => <label key={tool.id} className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/70 p-3"><input type="checkbox" checked={draft.allowedTools.includes(tool.id)} onChange={(event) => setDraft({ ...draft, allowedTools: event.target.checked ? [...draft.allowedTools, tool.id] : draft.allowedTools.filter((id) => id !== tool.id) })} className="mt-0.5 h-4 w-4 accent-cyan-400" /><span className="min-w-0"><b className="block break-all text-[11px] text-cyan-100">{tool.id}</b><span className="mt-1 block text-[10px] text-zinc-500">{tool.description}</span><span className={"mt-1 block text-[9px] " + (tool.sideEffect ? "text-amber-300" : "text-emerald-300")}>{tool.sideEffect ? "Side effects · explicit selection only" : "Read-only"}</span></span></label>)}</div></div>
        </details>
        <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} className="h-4 w-4 accent-cyan-400" />Enable this Agent after saving</label>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={() => setShowEditor(false)} className="rounded-xl border border-border px-4 py-2.5 text-xs text-zinc-300">Cancel</button><button type="submit" disabled={busy || !draft.name.trim() || !draft.role.trim() || !draft.instructions.trim()} className="rounded-xl bg-cyan-300 px-5 py-2.5 text-xs font-bold text-zinc-950 disabled:opacity-40">{busy ? "Saving…" : editingId ? "Save changes" : "Create Agent"}</button></div>
      </form></div>}

      {error && <p role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/[.08] p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[.06] p-3 text-xs text-emerald-200">{notice}</p>}
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return <article className="rounded-2xl border border-border bg-zinc-950/70 p-4"><p className="text-[10px] uppercase tracking-[.15em] text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p><p className="mt-1 text-[10px] text-zinc-600">{hint}</p></article>;
}

function AgentCard({ agent, busy, onRun, onEdit, onToggle, onDelete }: { agent: Agent; busy: boolean; onRun: () => void; onEdit: () => void; onToggle: () => void; onDelete?: () => void }) {
  return <article className="flex min-h-64 flex-col rounded-2xl border border-border bg-gradient-to-br from-white/[.035] to-transparent p-4 transition hover:border-cyan-400/25">
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/[.08] text-lg text-cyan-100">✳</span><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-white">{agent.name}</h3><p className="mt-1 truncate text-[10px] text-cyan-200">{agent.role}</p></div></div><span className={"shrink-0 rounded-full border px-2 py-1 text-[9px] " + (agent.enabled ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-zinc-700 bg-zinc-800 text-zinc-400")}>{agent.enabled ? "Ready" : "Paused"}</span></div>
    <p className="mt-4 min-h-10 text-xs leading-5 text-zinc-400">{agent.description || "Specialist Agent"}</p>
    <div className="mt-3 flex flex-wrap gap-1.5">{(agent.allowed_tools ?? []).slice(0, 4).map((tool) => <span key={tool} className="max-w-full truncate rounded-md border border-white/[.08] bg-black/20 px-2 py-1 text-[9px] text-zinc-400">{tool}</span>)}{(agent.allowed_tools ?? []).length > 4 && <span className="rounded-md border border-white/[.08] px-2 py-1 text-[9px] text-zinc-500">+{agent.allowed_tools.length - 4} more</span>}{!(agent.allowed_tools ?? []).length && <span className="rounded-md border border-amber-400/20 px-2 py-1 text-[9px] text-amber-200">No tools assigned</span>}</div>
    <div className="mt-auto flex flex-wrap gap-2 border-t border-border/70 pt-4 mt-4"><button type="button" disabled={busy || !agent.enabled || (agent.allowed_tools ?? []).length === 0} onClick={onRun} className="flex-1 rounded-lg bg-cyan-300 px-3 py-2 text-[11px] font-bold text-zinc-950 disabled:opacity-40">Run task</button><button type="button" disabled={busy} onClick={onEdit} className="rounded-lg border border-border px-3 py-2 text-[11px] text-zinc-300">Edit</button><button type="button" disabled={busy} onClick={onToggle} className="rounded-lg border border-border px-3 py-2 text-[11px] text-zinc-300">{agent.enabled ? "Pause" : "Enable"}</button>{onDelete && <button type="button" disabled={busy} onClick={onDelete} className="rounded-lg border border-rose-400/20 px-3 py-2 text-[11px] text-rose-300">Delete</button>}</div>
    <p className="mt-3 text-[9px] text-zinc-600">Provider: {agent.provider_preference} · {agent.max_steps} steps · {agent.max_tool_calls} calls</p>
  </article>;
}

function TemplateCard({ template, onChoose }: { template: Template; onChoose: () => void }) {
  return <button type="button" onClick={onChoose} className={"rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/40 " + template.tone}><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-lg text-white">{template.icon}</span><h3 className="mt-3 text-xs font-semibold text-white">{template.name}</h3><p className="mt-1 text-[10px] leading-5 text-zinc-400">{template.description}</p><span className="mt-3 block text-[10px] font-semibold text-cyan-200">Use template →</span></button>;
}

function EmptyState({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return <div className="rounded-2xl border border-dashed border-border p-8 text-center"><h3 className="text-sm font-semibold text-white">{title}</h3><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-zinc-500">{description}</p><button type="button" onClick={onAction} className="mt-4 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-bold text-zinc-950">{action}</button></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-[11px] text-zinc-400"><span>{label}</span>{children}</label>;
}
