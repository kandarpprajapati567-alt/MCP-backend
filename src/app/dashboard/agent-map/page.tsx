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
      const [agentData, taskData] = await Promise.all([agentResponse.json(), taskResponse.json()]);
      setAgents(Array.isArray(agentData.agents) ? agentData.agents : []);
      setTasks(Array.isArray(taskData.tasks) ? taskData.tasks : []);
      setConnected(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load Agent topology."); setConnected(false); }
    finally { setBusy(false); }
  }

  const active = agents.filter((agent) => agent.enabled).length;
  const running = tasks.filter((task) => ["running", "in_progress", "processing"].includes(task.status)).length;
  const completed = tasks.filter((task) => task.status === "completed").length;
  const assigned = roles.reduce((sum, role) => sum + agents.filter((agent) => (agent.role ?? "").toLowerCase() === role.toLowerCase()).length, 0);

  return <div className="agent-map-page space-y-7">
    <PageHeader title="Agent architecture" description="A role-oriented view of the orchestration engine. Saved definitions, observed workload and policy boundaries are kept distinct." />

    <section className="surface-card overflow-hidden p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div><p className="eyebrow">Architecture view / 01</p><h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-100 sm:text-3xl">Orchestrator & specialist layer</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">The planner coordinates work. Specialist definitions describe responsibilities; runtime allowlists, permission checks and approvals remain the actual execution boundary.</p></div>
        <Link href="/dashboard/agents" className="action-secondary">Manage definitions ↗</Link>
      </div>
      <div className="mt-7 grid gap-3 md:grid-cols-[1fr_auto_1.4fr] md:items-center">
        <div className="rounded-xl border border-[#c2a66b]/30 bg-[#c2a66b]/[.07] p-5">
          <p className="eyebrow">Control plane</p><strong className="mt-2 block text-lg text-stone-100">Planner / Router</strong><p className="mt-2 text-[11px] leading-5 text-stone-400">Task intake · plan validation · routing</p>
        </div>
        <div className="hidden px-2 text-2xl text-[#c2a66b] md:block">⟶</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {["Policy gate", "Tool registry", "Task ledger", "Synthesizer"].map((item, index) => <div key={item} className="rounded-lg border border-white/[.09] bg-white/[.025] p-3"><span className="text-[9px] font-bold text-stone-500">0{index + 1}</span><strong className="mt-2 block text-[11px] text-stone-200">{item}</strong></div>)}
        </div>
      </div>
      <div className="mt-4 border-t border-white/[.08] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="eyebrow">Specialist role matrix</p><span className="text-[9px] tracking-[.12em] text-stone-500">DEFINITIONS ≠ LIVE WORKERS</span></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {roles.map((role, index) => {
            const matches = agents.filter((agent) => (agent.role ?? "").toLowerCase() === role.toLowerCase());
            return <article key={role} className="rounded-xl border border-white/[.09] bg-[#181914] p-4">
              <div className="flex items-center justify-between gap-2"><span className="text-[9px] font-bold tracking-[.16em] text-[#d8bd83]">ROLE / 0{index + 1}</span><span className="rounded-full border border-white/[.1] px-2 py-1 text-[9px] text-stone-400">{matches.length} saved</span></div>
              <h3 className="mt-3 text-sm font-semibold text-stone-100">{role}</h3>
              {matches.length ? <div className="mt-3 space-y-2">{matches.map((agent) => <div key={agent.id} className="rounded-lg border border-white/[.07] bg-black/[.12] p-3"><div className="flex items-center justify-between gap-2"><strong className="text-xs text-stone-200">{agent.name}</strong><span className={agent.enabled ? "text-[8px] font-bold text-[#a9c2a7]" : "text-[8px] font-bold text-stone-500"}>{agent.enabled ? "ENABLED" : "PAUSED"}</span></div><p className="mt-2 text-[10px] leading-5 text-stone-500">{agent.description || "No description supplied"}</p><p className="mt-2 text-[9px] text-stone-600">{agent.allowed_tools?.length ?? 0} allowed tools · {agent.max_steps ?? "—"} max steps</p></div>)}</div> : <p className="mt-3 text-[10px] leading-5 text-stone-500">No saved definition for this role.</p>}
            </article>;
          })}
        </div>
        {agents.filter((agent) => !roles.some((role) => role.toLowerCase() === (agent.role ?? "").toLowerCase())).length > 0 && <div className="mt-3 rounded-xl border border-white/[.09] p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Other definitions</p><div className="mt-3 flex flex-wrap gap-2">{agents.filter((agent) => !roles.some((role) => role.toLowerCase() === (agent.role ?? "").toLowerCase())).map((agent) => <span key={agent.id} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-stone-300">{agent.name} · {agent.enabled ? "enabled" : "paused"}</span>)}</div></div>}
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-3">
      <div className="metric-card"><span className="metric-label">Enabled definitions</span><strong className="metric-value">{connected ? active : "—"}</strong><span className="metric-note">{connected ? agents.length + " total saved" : "Connect to inspect"}</span></div>
      <div className="metric-card"><span className="metric-label">Observed running tasks</span><strong className="metric-value">{connected ? running : "—"}</strong><span className="metric-note">Current returned task state</span></div>
      <div className="metric-card"><span className="metric-label">Task history</span><strong className="metric-value">{connected ? tasks.length : "—"}</strong><span className="metric-note">{connected ? completed + " completed · " + assigned + " role-matched definitions" : "Owner access required"}</span></div>
    </section>

    {!connected ? <section className="surface-card p-5 sm:p-6"><div className="panel-heading"><div><p className="eyebrow">Read-only data connection</p><h3 className="mt-2">Load your Agent architecture</h3><p>Token is used only for owner-scoped Agent and task requests and is not persisted.</p></div></div><div className="flex flex-col gap-3 sm:flex-row"><input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="FS_OWNER_TOKEN" aria-label="Owner master token" className="min-w-0 flex-1 px-4 py-3 text-sm"/><button type="button" disabled={busy || token.length < 32} onClick={() => void connect()} className="action-primary">{busy ? "Loading…" : "Load architecture"}</button></div>{error && <p role="alert" className="mt-3 text-xs text-[#e3a092]">{error}</p>}</section> : <section className="surface-card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Owner data loaded</p><h3 className="mt-2 text-base font-semibold text-stone-100">Architecture snapshot</h3></div><button type="button" disabled={busy} onClick={() => void connect()} className="action-secondary">{busy ? "Refreshing…" : "Refresh snapshot ↻"}</button></div><p className="mt-3 text-xs text-stone-400">{agents.length} Agent definitions and {tasks.length} task records returned by the backend. This is a configuration and history view, not a claim that each role is running as an independent process.</p></section>}
    <p className="text-[10px] leading-5 text-stone-600">Security invariant: this visual map does not grant permissions. Runtime tool allowlists, permission checks and approval gates remain authoritative.</p>
  </div>;
}
