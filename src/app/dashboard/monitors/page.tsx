"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";

type Health = { status?: string; version?: string; services?: { database?: string; authentication?: string } };
type Agent = { id: string; enabled: boolean };
type Task = { id: string; status: string; task: string; created_at: string };
type Tool = { id: string; sideEffect: boolean; permission: string };
type Provider = { provider: string };

function Metric({ label, value, note, tone = "cyan" }: { label: string; value: string | number; note: string; tone?: string }) {
  const colors: Record<string, string> = { cyan: "text-cyan-200", violet: "text-violet-200", emerald: "text-emerald-200", amber: "text-amber-200" };
  return <div className="rounded-xl border border-white/10 bg-gradient-to-br from-[#172234] to-[#0b111c] p-4"><p className="text-[9px] font-bold tracking-[.17em] text-slate-500">{label}</p><strong className={"mt-2 block text-2xl " + (colors[tone] ?? colors.cyan)}>{value}</strong><p className="mt-1 text-[10px] text-slate-500">{note}</p></div>;
}

export default function MonitorsPage() {
  const [token, setToken] = useState("");
  const [health, setHealth] = useState<Health>({});
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState("");

  async function refresh() {
    setBusy(true); setError("");
    try {
      const healthResponse = await fetch("/api/v1/health", { cache: "no-store" });
      const healthData = await healthResponse.json();
      setHealth(healthData);
      if (token.length >= 32) {
        const headers = { "x-fs-owner-token": token };
        const responses = await Promise.all([
          fetch("/api/v1/agents", { headers, cache: "no-store" }),
          fetch("/api/v1/agent/tasks", { headers, cache: "no-store" }),
          fetch("/api/v1/tools", { headers, cache: "no-store" }),
          fetch("/api/v1/ai/providers/keys", { headers, cache: "no-store" }),
        ]);
        if (responses.some((response) => !response.ok)) throw new Error(responses.some((response) => response.status === 401) ? "Owner token rejected." : "Some owner monitor data is unavailable.");
        const [agentData, taskData, toolData, providerData] = await Promise.all(responses.map((response) => response.json()));
        setAgents(agentData.agents ?? []); setTasks(taskData.tasks ?? []); setTools(toolData.tools ?? []); setProviders(providerData.providers ?? []); setConnected(true);
      }
      setCheckedAt(new Date().toLocaleString());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Monitor refresh failed."); }
    finally { setBusy(false); }
  }

  const running = tasks.filter((task) => ["running", "in_progress", "processing"].includes(task.status)).length;
  const completed = tasks.filter((task) => task.status === "completed").length;
  const failed = tasks.filter((task) => ["failed", "error"].includes(task.status)).length;

  return <div className="mx-auto max-w-[1440px] space-y-6">
    <PageHeader title="AI Operations Monitors" description="A workstation-style monitoring wall for task flow, backend health, AI capacity and verified capabilities."/>
    <section className="rounded-2xl border border-cyan-200/15 bg-[radial-gradient(ellipse_at_90%_0%,rgba(34,211,238,.13),transparent_50%),linear-gradient(140deg,#101b2a,#080d16)] p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[9px] font-bold tracking-[.22em] text-cyan-200">OPERATIONS WALL / 03</p><h2 className="mt-2 text-2xl font-semibold text-white">AI system status & work monitor</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Health and task counters come from backend responses. Device battery, server CPU, model memory and energy draw are not currently exposed by this API.</p></div><button type="button" disabled={busy} onClick={() => void refresh()} className="rounded-xl bg-cyan-200 px-4 py-3 text-xs font-bold text-slate-950 disabled:opacity-50">{busy ? "Refreshing…" : "Refresh telemetry ↻"}</button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="CORE API" value={health.status ?? "Not checked"} note={health.version ?? "Version not reported"}/><Metric label="DATABASE" value={health.services?.database ?? "Unknown"} note="Supabase health indicator" tone="emerald"/><Metric label="AUTHENTICATION" value={health.services?.authentication ?? "Unknown"} note="Backend health indicator" tone="violet"/><Metric label="LAST SAMPLE" value={checkedAt ? (checkedAt.includes(",") ? checkedAt.slice(checkedAt.lastIndexOf(",") + 1).trim() : checkedAt) : "—"} note={checkedAt || "No sample yet"} tone="amber"/></div>
    </section>
    {!connected && <section className="rounded-xl border border-white/10 bg-[#0b121e] p-5"><h3 className="text-sm font-semibold text-white">Unlock owner telemetry</h3><p className="mt-1 text-xs text-slate-500">Connect to view Agent, task, tool and provider counts. The token remains in memory only.</p><div className="mt-4 flex flex-col gap-3 sm:flex-row"><input aria-label="Owner master token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="FS_OWNER_TOKEN" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white"/><button type="button" disabled={busy || token.length < 32} onClick={() => void refresh()} className="rounded-xl border border-cyan-200/25 bg-cyan-200/[.08] px-5 py-3 text-xs font-bold text-cyan-100 disabled:opacity-40">Connect monitors</button></div></section>}
    {connected && <><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="ENABLED AGENTS" value={agents.filter((agent) => agent.enabled).length} note={agents.length + " definitions registered"} tone="violet"/><Metric label="RUNNING TASKS" value={running} note="Current observed task state" tone="cyan"/><Metric label="COMPLETED / FAILED" value={completed + " / " + failed} note={tasks.length + " recent tasks returned"} tone="emerald"/><Metric label="TOOLS / PROVIDERS" value={tools.length + " / " + providers.length} note={tools.filter((tool) => !tool.sideEffect).length + " read-only tools in catalog"} tone="amber"/></section>
    <section className="grid gap-4 xl:grid-cols-2"><div className="rounded-xl border border-white/10 bg-[#0b121e] p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white">Work queue</h3><Link href="/dashboard/agent-lab" className="text-[10px] text-cyan-200">Open Agent Lab ↗</Link></div><div className="mt-4 space-y-2">{tasks.slice(0,8).map((task) => <div key={task.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[.07] bg-white/[.02] p-3"><div className="min-w-0"><p className="truncate text-xs text-slate-200">{task.task}</p><p className="mt-1 text-[9px] text-slate-500">{new Date(task.created_at).toLocaleString()}</p></div><span className="shrink-0 text-[9px] font-bold uppercase text-cyan-200">{task.status}</span></div>)}{tasks.length === 0 && <p className="text-xs text-slate-500">No recent tasks returned.</p>}</div></div>
    <div className="rounded-xl border border-white/10 bg-[#0b121e] p-5"><h3 className="text-sm font-semibold text-white">AI strength & capability</h3><p className="mt-1 text-[10px] text-slate-500">Counts describe configuration, not benchmark intelligence or guaranteed performance.</p><div className="mt-4 space-y-3">{[{name:"Tool breadth",value:tools.length,detail:"Registered backend tools"},{name:"Read-only surface",value:tools.filter((tool) => !tool.sideEffect).length,detail:"Tools not marked side-effecting"},{name:"Configured providers",value:providers.length,detail:"Provider credentials configured"},{name:"Specialist Agents",value:agents.length,detail:"Saved Agent definitions"}].map((item) => <div key={item.name}><div className="flex justify-between text-xs"><span className="text-slate-300">{item.name}</span><strong className="text-white">{item.value}</strong></div><p className="mt-1 text-[9px] text-slate-500">{item.detail}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{width: Math.min(100,item.value*10)+"%"}}/></div></div>)}</div></div></section></>}
    <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-amber-200/15 bg-[#17140f] p-4"><p className="text-[9px] font-bold tracking-[.15em] text-amber-100">DEVICE POWER</p><strong className="mt-2 block text-lg text-white">Not measured</strong><p className="mt-1 text-[10px] text-slate-500">Android battery telemetry is not connected to this web monitor.</p></div><div className="rounded-xl border border-white/10 bg-[#111722] p-4"><p className="text-[9px] font-bold tracking-[.15em] text-slate-400">SERVER COMPUTE</p><strong className="mt-2 block text-lg text-white">Not exposed</strong><p className="mt-1 text-[10px] text-slate-500">CPU, RAM and GPU metrics require a trusted telemetry source.</p></div><div className="rounded-xl border border-white/10 bg-[#111722] p-4"><p className="text-[9px] font-bold tracking-[.15em] text-slate-400">MODEL POWER</p><strong className="mt-2 block text-lg text-white">Not measured</strong><p className="mt-1 text-[10px] text-slate-500">No inference energy or token-speed data is currently supplied.</p></div></section>
    {error && <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/[.06] p-3 text-xs text-rose-200">{error}</p>}
    <p className="text-[10px] leading-5 text-slate-500">No synthetic telemetry is generated. A missing metric is shown as unavailable rather than estimated.</p>
  </div>;
}
