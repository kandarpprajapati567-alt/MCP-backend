"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

type Health = {
  status?: string;
  services?: { database?: string; authentication?: string };
  version?: string;
};

type NodeId = "dashboard" | "agent" | "mcp" | "bot" | "database" | "providers";
type NodeInfo = {
  id: NodeId;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  layer: string;
  state: "live" | "building" | "optional";
};

const nodes: NodeInfo[] = [
  { id: "dashboard", title: "Control Centre", subtitle: "Web interface", description: "Owner workspace for health, agent tasks, channel tests, provider settings and operational visibility.", href: "/dashboard", layer: "Interface", state: "live" },
  { id: "agent", title: "Agent Runtime", subtitle: "Task orchestration", description: "The task execution surface and registered tools are available. Shared Agent Core integration is tracked separately and must pass its own tests before being called complete.", href: "/dashboard/agent-lab", layer: "Orchestration", state: "building" },
  { id: "mcp", title: "MCP Server", subtitle: " /api/mcp", description: "Stateless MCP endpoint with owner-token authentication, tool discovery and tool invocation. ChatGPT OAuth is not configured.", href: "/dashboard/mcp", layer: "Integration", state: "live" },
  { id: "bot", title: "Bot Gateway", subtitle: "Channel contract", description: "The normalized channel contract test centre is available. Telegram webhook verification and end-to-end delivery are not yet connected; other channels remain planned.", href: "/dashboard/bot-channels", layer: "Channels", state: "building" },
  { id: "database", title: "Memory & Database", subtitle: "Supabase", description: "Backend persistence and authentication health are read from the public health endpoint. Owner-only memory and device controls remain behind authentication.", href: "/dashboard/database", layer: "Data", state: "live" },
  { id: "providers", title: "AI Providers", subtitle: "Optional model layer", description: "Provider adapters can be configured from AI Engine. No paid provider is required for safe backend health and contract tests; model inference may have separate costs.", href: "/dashboard/models", layer: "Intelligence", state: "optional" },
];

const statusTone: Record<string, string> = {
  ok: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  live: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  building: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  optional: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  unavailable: "border-rose-400/25 bg-rose-400/10 text-rose-300",
  checking: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

function StatusPill({ value }: { value: string }) {
  const key = value.toLowerCase();
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusTone[key] ?? statusTone.checking}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{value.replace(/_/g, " ")}</span>;
}

export default function SystemMapPage() {
  const [health, setHealth] = useState<Health>({});
  const [healthState, setHealthState] = useState("checking");
  const [selected, setSelected] = useState<NodeId>("agent");
  const [checkedAt, setCheckedAt] = useState("");

  const refresh = useCallback(async () => {
    setHealthState("checking");
    try {
      const response = await fetch("/api/v1/health", { cache: "no-store" });
      const data = await response.json() as Health;
      setHealth(data);
      setHealthState(response.ok ? (data.status ?? "unknown") : "unavailable");
      setCheckedAt(new Date().toLocaleTimeString());
    } catch {
      setHealthState("unavailable");
      setCheckedAt(new Date().toLocaleTimeString());
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const active = nodes.find((node) => node.id === selected) ?? nodes[0];
  const dbStatus = health.services?.database ?? "unknown";
  const authStatus = health.services?.authentication ?? "unknown";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader title="System Architecture Map" description="Explore the control plane, agent runtime, integration gateways and data services. Select any component to inspect its responsibility and open its control page." />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface-raised/80 p-4"><p className="text-xs text-slate-400">Backend health</p><div className="mt-3"><StatusPill value={healthState} /></div><p className="mt-2 text-[11px] text-slate-500">Live public health probe</p></div>
        <div className="rounded-2xl border border-border bg-surface-raised/80 p-4"><p className="text-xs text-slate-400">Database</p><div className="mt-3"><StatusPill value={dbStatus} /></div><p className="mt-2 text-[11px] text-slate-500">Supabase service check</p></div>
        <div className="rounded-2xl border border-border bg-surface-raised/80 p-4"><p className="text-xs text-slate-400">Authentication</p><div className="mt-3"><StatusPill value={authStatus} /></div><p className="mt-2 text-[11px] text-slate-500">Backend auth service check</p></div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised/80 p-4"><div><p className="text-xs text-slate-400">Last checked</p><p className="mt-3 text-sm font-semibold text-white">{checkedAt || "Waiting…"}</p><p className="mt-2 text-[11px] text-slate-500">{health.version ?? "Version not reported"}</p></div><button type="button" onClick={() => void refresh()} className="rounded-xl border border-cyan-400/25 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/10">Refresh</button></div>
      </section>

      <section className="rounded-3xl border border-border bg-slate-950/75 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-cyan-300">Live architecture view</p><h2 className="mt-2 text-lg font-semibold text-white">Request and capability flow</h2><p className="mt-1 text-xs text-slate-400">Conceptual system relationships · status labels reflect current implementation, not planned promises</p></div><StatusPill value={healthState} /></div>
        <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_44px_1fr_44px_1fr] lg:items-stretch">
          <button type="button" onClick={() => setSelected("dashboard")} className={`map-node rounded-2xl border p-4 text-left transition hover:border-cyan-300/50 ${selected === "dashboard" ? "border-cyan-300/60 bg-cyan-400/10" : "border-slate-700 bg-slate-900/80"}`}><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">01 · Interface</span><h3 className="mt-2 font-semibold text-white">Control Centre</h3><p className="mt-1 text-xs text-slate-400">Dashboard · owner controls</p><div className="mt-3"><StatusPill value="live" /></div></button>
          <div className="flex items-center justify-center text-cyan-300/60"><span className="hidden lg:block">→</span><span className="lg:hidden">↓</span></div>
          <button type="button" onClick={() => setSelected("agent")} className={`map-node rounded-2xl border p-4 text-left transition hover:border-violet-300/50 ${selected === "agent" ? "border-violet-300/60 bg-violet-400/10" : "border-slate-700 bg-slate-900/80"}`}><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">02 · Orchestration</span><h3 className="mt-2 font-semibold text-white">Agent Runtime</h3><p className="mt-1 text-xs text-slate-400">Plan · route · execute · verify</p><div className="mt-3"><StatusPill value="building" /></div></button>
          <div className="flex items-center justify-center text-cyan-300/60"><span className="hidden lg:block">→</span><span className="lg:hidden">↓</span></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <button type="button" onClick={() => setSelected("mcp")} className={`map-node rounded-2xl border p-4 text-left transition hover:border-cyan-300/50 ${selected === "mcp" ? "border-cyan-300/60 bg-cyan-400/10" : "border-slate-700 bg-slate-900/80"}`}><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">03A · Protocol</span><h3 className="mt-2 font-semibold text-white">MCP Server</h3><p className="mt-1 text-xs text-slate-400">Tools · resources · prompts</p><div className="mt-3"><StatusPill value="live" /></div></button>
            <button type="button" onClick={() => setSelected("bot")} className={`map-node rounded-2xl border p-4 text-left transition hover:border-amber-300/50 ${selected === "bot" ? "border-amber-300/60 bg-amber-400/10" : "border-slate-700 bg-slate-900/80"}`}><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">03B · Channels</span><h3 className="mt-2 font-semibold text-white">Bot Gateway</h3><p className="mt-1 text-xs text-slate-400">Telegram · web · Android</p><div className="mt-3"><StatusPill value="building" /></div></button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setSelected("database")} className={`map-node rounded-2xl border p-4 text-left transition ${selected === "database" ? "border-emerald-300/60 bg-emerald-400/10" : "border-slate-700 bg-slate-900/80"}`}><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">04 · Data layer</span><h3 className="mt-2 font-semibold text-white">Memory & Database</h3><p className="mt-1 text-xs text-slate-400">Supabase persistence · owner data</p><div className="mt-3"><StatusPill value={dbStatus} /></div></button>
          <button type="button" onClick={() => setSelected("providers")} className={`map-node rounded-2xl border p-4 text-left transition ${selected === "providers" ? "border-sky-300/60 bg-sky-400/10" : "border-slate-700 bg-slate-900/80"}`}><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">05 · Intelligence layer</span><h3 className="mt-2 font-semibold text-white">AI Providers</h3><p className="mt-1 text-xs text-slate-400">Optional external or local model</p><div className="mt-3"><StatusPill value="optional" /></div></button>
        </div>
        <div className="mt-5 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.04] p-4"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-200">Selected component · {active.layer}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-white">{active.title}</h3><p className="mt-1 text-xs text-slate-400">{active.subtitle}</p></div><Link href={active.href} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-200">Open controls ↗</Link></div><p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">{active.description}</p></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {nodes.map((node) => <Link key={node.id} href={node.href} className="group rounded-2xl border border-border bg-surface-raised/70 p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/30"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{node.layer}</span><span className="text-xs text-cyan-300 opacity-0 transition group-hover:opacity-100">Open ↗</span></div><h3 className="mt-2 text-sm font-semibold text-white">{node.title}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{node.description}</p></Link>)}
      </section>
    </div>
  );
}
