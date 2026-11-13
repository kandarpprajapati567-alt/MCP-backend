"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";

type Agent = { id: string; name: string; role?: string; description?: string; enabled: boolean; allowed_tools?: string[]; max_steps?: number; max_tool_calls?: number };
type Task = { id: string; status: string; task: string; agent_snapshot?: { name?: string } | null };

const roles = ["Planner", "Research", "Coding", "Execution", "Analysis", "Memory", "Synthesizer"];

export default function AgentMapPage() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setBusy(true); setError("");
    try {
      const headers = { "x-fs-owner-token": token };
      const [agentResponse, taskResponse] = await Promise.all([
        fetch("/api/v1/agents", { headers, cache: "no-store" }),
        fetch("/api/v1/agent/tasks", { headers, cache: "no-store" }),
      ]);
      if (!agentResponse.ok || !taskResponse.ok) throw new Error(agentResponse.status === 401 || taskResponse.status === 401 ? "Owner token rejected. Check it and retry." : "Agent or task data is unavailable.");
      const agentData = await agentResponse.json();
      const taskData = await taskResponse.json();
      setAgents(Array.isArray(agentData.agents) ? agentData.agents : []);
      setTasks(Array.isArray(taskData.tasks) ? taskData.tasks : []);
      setConnected(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load Agent topology."); setConnected(false); }
    finally { setBusy(false); }
  }

  const active = agents.filter((agent) => agent.enabled).length;
  const running = tasks.filter((task) => ["running", "in_progress", "processing"].includes(task.status)).length;
  const completed = tasks.filter((task) => task.status === "completed").length;

  return <div className="agent-map-page mx-auto max-w-[1440px] space-y-6">
    <PageHeader title="Agentic Operations Map" description="A dedicated view of specialist Agents, their configured responsibilities and observed task activity. This map is read-only." />
    <section className="rounded-2xl border border-violet-300/20 bg-[radial-gradient(ellipse_at_80%_0%,rgba(139,92,246,.16),transparent_55%),linear-gradient(135deg,#101323,#080d18)] p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-[10px] font-bold tracking-[.22em] text-violet-200">INTELLIGENCE TOPOLOGY / 01</p><h2 className="mt-2 text-2xl font-semibold text-white">One orchestrator. Specialist workers.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Configured Agent definitions are shown separately from runtime execution. A role or visual link never grants additional tool permissions.</p></div>
        <Link href="/dashboard/agents" className="rounded-xl border border-violet-200/25 bg-violet-300/10 px-4 py-3 text-xs font-semibold text-violet-100">Manage Agents ↗</Link>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/25 p-4"><p className="text-[9px] tracking-[.18em] text-slate-500">ENABLED AGENTS</p><strong className="mt-2 block text-2xl text-white">{connected ? active : "—"}</strong></div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-4"><p className="text-[9px] tracking-[.18em] text-slate-500">OBSERVED RUNNING TASKS</p><strong className="mt-2 block text-2xl text-white">{connected ? running : "—"}</strong></div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-4"><p className="text-[9px] tracking-[.18em] text-slate-500">TASKS IN HISTORY</p><strong className="mt-2 block text-2xl text-white">{connected ? tasks.length : "—"}</strong><p className="mt-1 text-[10px] text-slate-500">{connected ? completed + " completed" : "Connect to inspect"}</p></div>
      </div>
    </section>
    {!connected ? <section className="rounded-2xl border border-white/10 bg-[#0c1320] p-5"><h3 className="text-sm font-semibold text-white">Secure owner connection</h3><p className="mt-1 text-xs text-slate-500">Token stays in this page's memory and is used only for read-only Agent/task requests.</p><div className="mt-4 flex flex-col gap-3 sm:flex-row"><input aria-label="Owner master token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="FS_OWNER_TOKEN" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white"/><button type="button" disabled={busy || token.length < 32} onClick={() => void connect()} className="rounded-xl bg-violet-300 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">{busy ? "Loading map…" : "Load Agent Map"}</button></div>{error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}</section> :
    <section className="rounded-2xl border border-white/10 bg-[#090f1b] p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[9px] font-bold tracking-[.2em] text-violet-200">02 / LIVE CONFIGURATION</p><h3 className="mt-2 text-lg font-semibold text-white">Agent network</h3></div><button type="button" disabled={busy} onClick={() => void connect()} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">Refresh</button></div>
      <div className="mx-auto my-6 max-w-md rounded-xl border border-violet-300/30 bg-violet-300/[.08] p-4 text-center"><span className="text-[9px] font-bold tracking-[.18em] text-violet-200">ORCHESTRATION CORE</span><strong className="mt-1 block text-lg text-white">Planner / Router</strong><p className="mt-1 text-[10px] text-slate-400">Routes only through configured and policy-approved capabilities</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{roles.map((role) => { const matches = agents.filter((agent) => (agent.role ?? "").toLowerCase() === role.toLowerCase()); return <div key={role} className="rounded-xl border border-violet-300/15 bg-gradient-to-br from-[#17182a] to-[#0b111e] p-4"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-bold tracking-[.16em] text-violet-200">{role.toUpperCase()}</span><span className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-slate-400">{matches.length} configured</span></div>{matches.length ? matches.map((agent) => <div key={agent.id} className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-white">{agent.name}</strong><span className={agent.enabled ? "text-[9px] text-emerald-300" : "text-[9px] text-slate-500"}>{agent.enabled ? "ENABLED" : "PAUSED"}</span></div><p className="mt-1 text-[10px] text-slate-400">{agent.description || "No description supplied"}</p><p className="mt-2 text-[9px] text-slate-500">{agent.allowed_tools?.length ?? 0} allowed tools · {agent.max_steps ?? "—"} max steps</p></div>) : <p className="mt-4 text-xs text-slate-500">No Agent configured for this role yet.</p>}</div>; })}</div>
      {agents.filter((agent) => !roles.some((role) => role.toLowerCase() === (agent.role ?? "").toLowerCase())).length > 0 && <div className="mt-4 rounded-xl border border-white/10 p-4"><h4 className="text-xs font-semibold text-white">Custom / general Agents</h4><div className="mt-3 flex flex-wrap gap-2">{agents.filter((agent) => !roles.some((role) => role.toLowerCase() === (agent.role ?? "").toLowerCase())).map((agent) => <span key={agent.id} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">{agent.name} · {agent.enabled ? "enabled" : "paused"}</span>)}</div></div>}
    </section>}
    <p className="text-[10px] leading-5 text-slate-500">Security boundary: this page reads owner-scoped Agent definitions and task history only. Execution authority remains in the backend tool allowlist, runtime permissions and approval checks.</p>
  </div>;
}
