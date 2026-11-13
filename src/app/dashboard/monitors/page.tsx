"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";

type Health = { status?: string; version?: string; services?: { database?: string; authentication?: string } };
type Agent = { id: string; enabled: boolean };
type Task = { id: string; status: string; task: string; created_at: string };
type Tool = { id: string; sideEffect: boolean; permission: string };
type Provider = { provider: string };

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div className="metric-card"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-note">{note}</span></div>;
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
      if (!healthResponse.ok) throw new Error("Health endpoint did not return a successful response.");
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
        setAgents(agentData.agents ?? []); setTasks(taskData.tasks ?? []);
        setTools(toolData.tools ?? []); setProviders(providerData.providers ?? []); setConnected(true);
      }
      setCheckedAt(new Date().toLocaleString());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Monitor refresh failed."); }
    finally { setBusy(false); }
  }

  const running = tasks.filter((task) => ["running", "in_progress", "processing"].includes(task.status)).length;
  const completed = tasks.filter((task) => task.status === "completed").length;
  const failed = tasks.filter((task) => ["failed", "error"].includes(task.status)).length;
  const database = health.services?.database ?? "unknown";
  const auth = health.services?.authentication ?? "unknown";

  return <div className="monitor-page space-y-7">
    <PageHeader title="Operations room" description="A live-read view of the services and workloads the backend actually exposes. Unavailable telemetry stays clearly marked as unavailable." />

    <section className="command-deck p-5 sm:p-8">
      <div className="relative grid gap-6 xl:grid-cols-[1fr_auto] xl:items-end">
        <div><p className="eyebrow">Operations / monitor wall</p><h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-100 sm:text-3xl">System health & workload</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-stone-400">Refresh to sample the public health endpoint. Connect owner access to inspect Agent definitions, task history, tools and configured providers.</p></div>
        <button type="button" disabled={busy} onClick={() => void refresh()} className="action-primary">{busy ? "Sampling…" : "Refresh monitor data ↻"}</button>
      </div>
      <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="monitor-tile monitor-tile-primary"><span className="monitor-label">CORE API</span><strong>{health.status ?? "Not checked"}</strong><span className="monitor-foot">Version {health.version ?? "not reported"}</span></div>
        <div className="monitor-tile"><span className="monitor-label">DATABASE</span><strong>{database}</strong><span className="monitor-foot">Backend health indicator</span></div>
        <div className="monitor-tile"><span className="monitor-label">AUTH SERVICE</span><strong>{auth}</strong><span className="monitor-foot">Backend health indicator</span></div>
        <div className="monitor-tile"><span className="monitor-label">LAST SAMPLE</span><strong className="!text-base">{checkedAt ? checkedAt.split(",").slice(-1)[0].trim() : "—"}</strong><span className="monitor-foot">{checkedAt || "No sample yet"}</span></div>
      </div>
    </section>

    {!connected && <section className="surface-card p-5 sm:p-6"><div className="panel-heading"><div><p className="eyebrow">Owner telemetry</p><h3 className="mt-2">Unlock workload metrics</h3><p>Connect to view owner-scoped Agent, task, tool and provider counts. The token remains in this page's memory only.</p></div></div><div className="flex flex-col gap-3 sm:flex-row"><input aria-label="Owner master token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="FS_OWNER_TOKEN" className="min-w-0 flex-1 px-4 py-3 text-sm"/><button type="button" disabled={busy || token.length < 32} onClick={() => void refresh()} className="action-primary">Connect monitors</button></div></section>}

    {connected && <>
      <div className="metric-grid">
        <Metric label="Enabled agents" value={agents.filter((agent) => agent.enabled).length} note={agents.length + " saved definitions"} />
        <Metric label="Running tasks" value={running} note="Current returned task state" />
        <Metric label="Completed / failed" value={completed + " / " + failed} note={tasks.length + " returned task records"} />
        <Metric label="Tools / providers" value={tools.length + " / " + providers.length} note={tools.filter((tool) => !tool.sideEffect).length + " read-only tools in registry"} />
      </div>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="surface-card p-5 sm:p-6"><div className="panel-heading"><div><p className="eyebrow">Task stream</p><h3 className="mt-2">Recent work queue</h3><p>Latest task records returned by the backend.</p></div><Link href="/dashboard/agent-lab" className="action-secondary">Agent workbench ↗</Link></div>
          <div className="space-y-2">{tasks.slice(0, 8).map((task) => <div key={task.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[.08] bg-black/[.12] p-3"><div className="min-w-0"><p className="truncate text-xs text-stone-200">{task.task}</p><p className="mt-1 text-[9px] text-stone-500">{new Date(task.created_at).toLocaleString()}</p></div><span className="shrink-0 text-[9px] font-bold uppercase text-[#d8bd83]">{task.status.replace(/_/g, " ")}</span></div>)}{tasks.length === 0 && <p className="text-xs text-stone-500">No recent tasks returned.</p>}</div>
        </div>
        <div className="surface-card p-5 sm:p-6"><div className="panel-heading"><div><p className="eyebrow">Capability inventory</p><h3 className="mt-2">Registered system surface</h3><p>Counts describe configuration, not intelligence benchmarks or guaranteed performance.</p></div></div>
          <div className="space-y-4">{[{name:"Tool registry",value:tools.length,detail:"Registered backend capabilities"},{name:"Read-only tools",value:tools.filter((tool) => !tool.sideEffect).length,detail:"Tools not marked side-effecting"},{name:"Configured providers",value:providers.length,detail:"Provider credentials configured"},{name:"Agent definitions",value:agents.length,detail:"Saved specialist definitions"}].map((item) => <div key={item.name} className="flex items-center justify-between gap-4 border-b border-white/[.07] pb-3 last:border-0"><div><p className="text-xs font-semibold text-stone-200">{item.name}</p><p className="mt-1 text-[10px] text-stone-500">{item.detail}</p></div><strong className="text-xl font-semibold text-[#d8bd83]">{item.value}</strong></div>)}</div>
        </div>
      </section>
    </>}

    <section className="grid gap-3 md:grid-cols-3">
      <div className="surface-card p-4"><p className="eyebrow">Device power</p><strong className="mt-3 block text-lg text-stone-100">Not measured</strong><p className="mt-2 text-[10px] leading-5 text-stone-500">Android battery telemetry is not connected to this web monitor.</p></div>
      <div className="surface-card p-4"><p className="eyebrow">Server compute</p><strong className="mt-3 block text-lg text-stone-100">Not exposed</strong><p className="mt-2 text-[10px] leading-5 text-stone-500">CPU, RAM and GPU metrics require a trusted telemetry source.</p></div>
      <div className="surface-card p-4"><p className="eyebrow">Model performance</p><strong className="mt-3 block text-lg text-stone-100">Not measured</strong><p className="mt-2 text-[10px] leading-5 text-stone-500">No inference speed, token throughput or energy data is currently supplied.</p></div>
    </section>
    {error && <p role="alert" className="rounded-xl border border-[#c96b59]/30 bg-[#c96b59]/[.08] p-4 text-xs text-[#e3a092]">{error}</p>}
    <p className="text-[10px] leading-5 text-stone-600">Telemetry policy: only values returned by the backend are displayed. Missing metrics are not estimated or fabricated.</p>
  </div>;
}
