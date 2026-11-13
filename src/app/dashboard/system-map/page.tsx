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
  status: string;
  accent: string;
};

const nodes: NodeInfo[] = [
  { id: "dashboard", title: "Control Centre", subtitle: "OWNER INTERFACE", description: "Web workspace for system health, Agent tasks, provider settings, device pairing and operational controls.", href: "/dashboard", layer: "01 / Interface", status: "UI LAYER", accent: "cyan" },
  { id: "agent", title: "Agent Runtime", subtitle: "ORCHESTRATION CORE", description: "Planner and task execution surface. Shared Agent Core integration is still in progress; specialist execution is not represented as complete.", href: "/dashboard/agent-lab", layer: "02 / Intelligence", status: "BUILDING", accent: "violet" },
  { id: "mcp", title: "MCP Server", subtitle: "TOOL PROTOCOL", description: "Stateless MCP endpoint with owner-token authentication, tool discovery and invocation. ChatGPT OAuth is not configured.", href: "/dashboard/mcp", layer: "03 / Integration", status: "ENDPOINT", accent: "cyan" },
  { id: "bot", title: "Bot Gateway", subtitle: "CHANNEL ADAPTERS", description: "Normalized channel contract test centre. Telegram webhook verification and end-to-end delivery are not yet connected.", href: "/dashboard/bot-channels", layer: "04 / Channels", status: "BUILDING", accent: "amber" },
  { id: "database", title: "Memory & Database", subtitle: "PERSISTENCE LAYER", description: "Supabase persistence and authentication health are read from the public health endpoint. Owner-only memory and device controls remain authenticated.", href: "/dashboard/database", layer: "05 / Data", status: "HEALTH PROBED", accent: "emerald" },
  { id: "providers", title: "AI Providers", subtitle: "MODEL ROUTER", description: "Provider adapters can be configured from AI Engine. No paid provider is required for health and safe contract tests; model inference may have separate costs.", href: "/dashboard/models", layer: "06 / Model Layer", status: "OPTIONAL", accent: "sky" },
];

const accentClass: Record<string, string> = {
  cyan: "node-cyan",
  violet: "node-violet",
  amber: "node-amber",
  emerald: "node-emerald",
  sky: "node-sky",
};

const tone: Record<string, string> = {
  ok: "text-emerald-300 border-emerald-300/25 bg-emerald-300/[.08]",
  live: "text-emerald-300 border-emerald-300/25 bg-emerald-300/[.08]",
  healthy: "text-emerald-300 border-emerald-300/25 bg-emerald-300/[.08]",
  building: "text-amber-200 border-amber-300/25 bg-amber-300/[.08]",
  unavailable: "text-rose-300 border-rose-300/25 bg-rose-300/[.08]",
  checking: "text-slate-300 border-slate-400/20 bg-slate-400/[.06]",
  unknown: "text-slate-300 border-slate-400/20 bg-slate-400/[.06]",
};

function StatusPill({ value }: { value: string }) {
  const key = value.toLowerCase();
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.14em] ${tone[key] ?? "border-white/10 bg-white/[.04] text-slate-300"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{value.replace(/_/g, " ")}</span>;
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
    <div className="system-map-page mx-auto max-w-[1440px] space-y-6">
      <PageHeader title="System Map" description="A visual control-plane map of the Futuristic System stack. Select a node to inspect its role and open its control surface." />

      <section className="map-commandbar">
        <div className="flex flex-wrap items-center gap-3">
          <span className="map-orbit-mark" aria-hidden="true"><span /></span>
          <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-200">Architecture intelligence</p><p className="mt-1 text-sm text-slate-300">Distributed device layer · central MCP brain · governed execution</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill value={healthState} />
          <button type="button" onClick={() => void refresh()} className="rounded-xl border border-cyan-300/20 bg-cyan-300/[.06] px-3.5 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/[.12]">Refresh health ↻</button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="telemetry-card"><span>API HEALTH</span><strong className="text-cyan-100">{healthState}</strong><small>GET /api/v1/health</small></div>
        <div className="telemetry-card"><span>DATABASE</span><strong className="text-emerald-100">{dbStatus}</strong><small>Supabase service indicator</small></div>
        <div className="telemetry-card"><span>AUTHENTICATION</span><strong className="text-violet-100">{authStatus}</strong><small>Backend auth indicator</small></div>
        <div className="telemetry-card"><span>LAST PROBE</span><strong className="text-white">{checkedAt || "Waiting…"}</strong><small>{health.version ?? "Version not reported"}</small></div>
      </section>

      <section className="map-stage">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="map-eyebrow">01 / SYSTEM TOPOLOGY</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">Command & execution network</h2><p className="mt-2 max-w-2xl text-xs leading-6 text-slate-400">Conceptual relationships between the interface, orchestration, protocol gateways and data services. Statuses are intentionally conservative.</p></div>
          <div className="map-legend"><span><i className="legend-dot legend-cyan" />Interface</span><span><i className="legend-dot legend-violet" />Intelligence</span><span><i className="legend-dot legend-emerald" />Data</span></div>
        </div>

        <div className="topology-grid">
          <svg className="topology-lines" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="flowLine" x1="0" x2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity=".15" /><stop offset="50%" stopColor="#a78bfa" stopOpacity=".8" /><stop offset="100%" stopColor="#34d399" stopOpacity=".2" /></linearGradient></defs>
            <path d="M500 95 V160 M500 160 H250 V225 M500 160 V225 M500 160 H750 V225 M250 330 V395 H500 V455 M500 330 V455 M750 330 V395 H500" stroke="url(#flowLine)" strokeWidth="2" fill="none" strokeDasharray="7 8" />
            <circle cx="500" cy="160" r="5" fill="#67e8f9" /><circle cx="500" cy="395" r="5" fill="#a78bfa" />
          </svg>
          <div className="topology-node topology-root">
            <button type="button" onClick={() => setSelected("dashboard")} className={`map-node-card node-cyan ${selected === "dashboard" ? "is-selected" : ""}`}>
              <span className="node-index">01 / OWNER INTERFACE</span><span className="node-glyph">⌘</span><strong>Control Centre</strong><small>Dashboard · secure owner controls</small><em>WEB CONSOLE</em>
            </button>
          </div>
          <div className="topology-node topology-agent">
            <button type="button" onClick={() => setSelected("agent")} className={`map-node-card node-violet ${selected === "agent" ? "is-selected" : ""}`}>
              <span className="node-index">02 / ORCHESTRATION</span><span className="node-glyph">◈</span><strong>Agent Runtime</strong><small>Plan · route · execute · verify</small><em>INTEGRATION IN PROGRESS</em>
            </button>
          </div>
          <div className="topology-node topology-mcp">
            <button type="button" onClick={() => setSelected("mcp")} className={`map-node-card node-cyan ${selected === "mcp" ? "is-selected" : ""}`}>
              <span className="node-index">03A / PROTOCOL</span><span className="node-glyph">⌘</span><strong>MCP Server</strong><small>Tool discovery · invocation</small><em>ENDPOINT AVAILABLE</em>
            </button>
          </div>
          <div className="topology-node topology-bot">
            <button type="button" onClick={() => setSelected("bot")} className={`map-node-card node-amber ${selected === "bot" ? "is-selected" : ""}`}>
              <span className="node-index">03B / CHANNELS</span><span className="node-glyph">⌁</span><strong>Bot Gateway</strong><small>Telegram · web · Android bridge</small><em>BUILDING</em>
            </button>
          </div>
          <div className="topology-node topology-db">
            <button type="button" onClick={() => setSelected("database")} className={`map-node-card node-emerald ${selected === "database" ? "is-selected" : ""}`}>
              <span className="node-index">04 / DATA LAYER</span><span className="node-glyph">▤</span><strong>Memory & Database</strong><small>Supabase · owner-scoped data</small><em>{dbStatus.toUpperCase()}</em>
            </button>
          </div>
          <div className="topology-node topology-provider">
            <button type="button" onClick={() => setSelected("providers")} className={`map-node-card node-sky ${selected === "providers" ? "is-selected" : ""}`}>
              <span className="node-index">05 / MODEL LAYER</span><span className="node-glyph">✳</span><strong>AI Providers</strong><small>External or local model adapters</small><em>OPTIONAL</em>
            </button>
          </div>
        </div>

        <div className="map-inspector">
          <div className="min-w-0"><p className="map-eyebrow">02 / COMPONENT INSPECTOR · {active.layer}</p><h3 className="mt-2 text-lg font-semibold text-white">{active.title}</h3><p className="mt-1 text-[10px] font-bold tracking-[.16em] text-cyan-200/70">{active.subtitle}</p><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{active.description}</p></div>
          <Link href={active.href} className="shrink-0 rounded-xl bg-cyan-300 px-4 py-3 text-xs font-bold text-slate-950 transition hover:bg-cyan-200">Open controls ↗</Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {nodes.map((node) => <button key={node.id} type="button" onClick={() => setSelected(node.id)} className={`map-detail-card text-left ${accentClass[node.accent]} ${selected === node.id ? "is-selected" : ""}`}><div className="flex items-center justify-between gap-3"><span className="text-[9px] font-bold uppercase tracking-[.18em] text-slate-500">{node.layer}</span><span className="text-[9px] font-bold tracking-widest text-cyan-100/70">{node.status}</span></div><h3 className="mt-3 text-sm font-semibold text-white">{node.title}</h3><p className="mt-2 text-xs leading-5 text-slate-400">{node.description}</p></button>)}
      </section>

      <section className="map-footnote"><span className="text-cyan-200">SECURITY MODEL</span><p>Read-only by default. Write, destructive, external-side-effect and Android-device actions require explicit grants. A visual connection does not imply execution permission.</p><span className="shrink-0 text-slate-600">AUTH · {authStatus}</span></section>
    </div>
  );
}
