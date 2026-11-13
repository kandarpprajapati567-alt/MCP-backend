"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { SystemHealthCheck } from "@/components/dashboard/SystemHealthCheck";
import { CompleteSystemTest } from "@/components/dashboard/CompleteSystemTest";

type Task = { id: string; status: string; task: string; result: string | null; error_message?: string | null; failed_stage?: string | null; created_at: string; agent_snapshot?: { name?: string } | null };
type Agent = { id: string; name: string; enabled: boolean };
type Provider = { provider: string; updated_at: string };
type Health = { status?: string; services?: { database?: string; authentication?: string } };
type Tool = { id: string; description: string; permission: string; sideEffect: boolean };

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div className="metric-card"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-note">{note}</span></div>;
}

export default function DashboardPage() {
  const [token, setToken] = useState("");
  const [masterKey, setMasterKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [health, setHealth] = useState<Health>({});
  const [tools, setTools] = useState<Tool[]>([]);
  const [task, setTask] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentCatalogAvailable, setAgentCatalogAvailable] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingExpiresAt, setPairingExpiresAt] = useState("");
  const [pairingBusy, setPairingBusy] = useState(false);

  const api = useCallback(async (path: string, init: RequestInit = {}) =>
    fetch(path, { ...init, cache: "no-store", headers: {
      ...(init.headers ?? {}), "x-fs-owner-token": token,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    } }), [token]);

  const disconnect = useCallback(() => {
    setToken(""); setConnected(false); setTasks([]); setAgents([]); setSelectedAgentId("");
    setAgentCatalogAvailable(true); setProviders([]); setTools([]); setResult("");
    setMessage("Backend disconnected.");
  }, []);

  const refresh = useCallback(async () => {
    const [taskResponse, providerResponse, toolResponse, agentResponse] = await Promise.all([
      api("/api/v1/agent/tasks"), api("/api/v1/ai/providers/keys"),
      api("/api/v1/tools"), api("/api/v1/agents"),
    ]);
    if ([taskResponse, providerResponse, toolResponse, agentResponse].some((response) => response.status === 401)) {
      disconnect(); throw new Error("Owner master token was rejected. Connect again.");
    }
    if (!taskResponse.ok || !providerResponse.ok || !toolResponse.ok) throw new Error("Backend data is temporarily unavailable.");
    const [taskData, providerData, toolData] = await Promise.all([taskResponse.json(), providerResponse.json(), toolResponse.json()]);
    setTasks(taskData.tasks ?? []);
    if (agentResponse.ok) {
      const agentData = await agentResponse.json();
      const nextAgents = Array.isArray(agentData.agents) ? agentData.agents : [];
      setAgents(nextAgents); setAgentCatalogAvailable(true);
      if (selectedAgentId && !nextAgents.some((agent: Agent) => agent.id === selectedAgentId && agent.enabled)) setSelectedAgentId("");
    } else { setAgents([]); setSelectedAgentId(""); setAgentCatalogAvailable(false); }
    setProviders(providerData.providers ?? []); setTools(toolData.tools ?? []);
  }, [api, disconnect, selectedAgentId]);

  useEffect(() => {
    fetch("/api/v1/health", { cache: "no-store" }).then((response) => response.json())
      .then((data: Health) => setHealth(data)).catch(() => setHealth({ status: "unavailable" }));
  }, []);
  useEffect(() => {
    if (connected) void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Refresh failed."));
  }, [connected, refresh]);
  useEffect(() => {
    let active = true;
    fetch("/api/v1/session", { cache: "no-store" }).then((response) => response.json())
      .then((session: { authenticated?: boolean }) => { if (active && session.authenticated) setConnected(true); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function connect() {
    setConnecting(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/v1/tools", { headers: { "x-fs-owner-token": masterKey }, cache: "no-store" });
      const raw = await response.text();
      let data: { error?: string; tools?: Tool[] } = {};
      if (!raw.trim()) throw new Error(`Backend returned an empty response (HTTP ${response.status}).`);
      try { data = JSON.parse(raw) as { error?: string; tools?: Tool[] }; }
      catch { throw new Error(`Backend returned an invalid response (HTTP ${response.status}). Check the Render service and retry.`); }
      if (!response.ok) throw new Error(data.error ?? `Connection failed (HTTP ${response.status}). Check the owner token.`);
      if (!Array.isArray(data.tools)) throw new Error("Backend response is missing the tool registry. Please retry.");
      setToken(masterKey); setTools(data.tools); setConnected(true); setMasterKey("");
      setMessage("Owner token verified. The connection is held in this page's memory only.");
    } catch (cause) { setConnected(false); setError(cause instanceof Error ? cause.message : "Could not connect."); }
    finally { setConnecting(false); }
  }

  async function createPairingCode() {
    setPairingBusy(true); setError(""); setMessage(""); setPairingCode(""); setPairingExpiresAt("");
    try {
      const response = await api("/api/v1/devices/pairing", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create a pairing code.");
      setPairingCode(data.pairingCode); setPairingExpiresAt(data.expiresAt);
      setMessage("One-time device pairing code created. It expires in five minutes.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create a pairing code."); }
    finally { setPairingBusy(false); }
  }

  async function runTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setRunning(true); setError(""); setResult("");
    try {
      const response = await api("/api/v1/agent/tasks", { method: "POST", body: JSON.stringify({ task, ...(selectedAgentId ? { agentId: selectedAgentId } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Task execution failed.");
      setResult(data.status === "waiting_for_device" ? data.message ?? "Task is waiting for a connected device." : data.result ?? "Task completed.");
      setTask(""); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Task execution failed."); }
    finally { setRunning(false); }
  }

  async function saveKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      const response = await api("/api/v1/ai/providers/keys", { method: "PUT", body: JSON.stringify({ provider, apiKey }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save provider key.");
      setApiKey(""); setMessage(provider + " credential encrypted and saved."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save provider key."); }
  }

  async function removeKey(name: string) {
    if (!window.confirm("Remove saved " + name + " credential?")) return;
    try {
      const response = await api("/api/v1/ai/providers/keys", { method: "DELETE", body: JSON.stringify({ provider: name }) });
      if (!response.ok) throw new Error("Could not remove provider key.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove provider key."); }
  }

  const databaseStatus = health.services?.database ?? "checking";
  const backendStatus = health.status ?? "checking";
  const enabledAgents = agents.filter((agent) => agent.enabled).length;
  const activeTasks = tasks.filter((item) => ["running", "in_progress", "processing"].includes(item.status)).length;
  const failedTasks = tasks.filter((item) => ["failed", "error"].includes(item.status)).length;

  return (
    <div className="dashboard-page space-y-7">
      <PageHeader title="Command overview" description="A clear operational picture of your AI system — service health, agent activity, model access and the tools available to your workspace." />

      <section className="command-deck p-5 sm:p-8">
        <div className="command-deck-grid pointer-events-none absolute inset-0" />
        <div className="relative grid gap-8 xl:grid-cols-[1.1fr_.9fr] xl:items-center">
          <div>
            <p className="eyebrow">Personal AI infrastructure <span className="px-1 text-stone-600">/</span> Owner console</p>
            <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-[1.08] tracking-[-.045em] text-stone-100 sm:text-5xl">One workspace.<br /><span className="text-[#d8bd83]">Every system in view.</span></h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-stone-400">Inspect the engine, connect approved providers, run an Agent task and trace what the backend actually reports. No decorative online indicators or invented telemetry.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/dashboard/agent-lab" className="action-primary">Open Agent workbench <span aria-hidden>↗</span></Link>
              <Link href="/dashboard/system-map" className="action-secondary">System topology</Link>
              <Link href="/dashboard/agent-map" className="action-secondary">Agent architecture</Link>
              <Link href="/dashboard/bot-map" className="action-secondary">Bot architecture</Link>
            </div>
          </div>
          <div className="monitor-wall">
            <div className="monitor-wall-head"><span>01 / SERVICE READOUT</span><span>PUBLIC HEALTH PROBE</span></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="monitor-tile monitor-tile-primary"><span className="monitor-label">CORE API</span><strong>{backendStatus}</strong><span className="monitor-foot"><i className={backendStatus === "ok" ? "monitor-indicator is-live" : "monitor-indicator"} /> Health endpoint</span></div>
              <div className="monitor-tile"><span className="monitor-label">DATABASE</span><strong>{databaseStatus}</strong><span className="monitor-foot"><i className={databaseStatus === "ok" ? "monitor-indicator is-live" : "monitor-indicator"} /> PostgreSQL health</span></div>
              <div className="monitor-tile"><span className="monitor-label">REGISTERED TOOLS</span><strong>{connected ? tools.length : "—"}</strong><span className="monitor-foot">{connected ? "Owner data loaded" : "Owner access required"}</span></div>
              <div className="monitor-tile"><span className="monitor-label">MODEL PROVIDERS</span><strong>{connected ? providers.length : "—"}</strong><span className="monitor-foot">Configured credentials</span></div>
            </div>
            <div className="monitor-wall-foot mt-3 border-t border-white/[.07] pt-3"><span>PRIVATE OWNER MODE</span><span>UNVERIFIED = NOT SHOWN AS LIVE</span></div>
          </div>
        </div>
      </section>

      <div className="metric-grid">
        <Metric label="Backend" value={backendStatus} note="Live /api/v1/health response" />
        <Metric label="Database" value={databaseStatus} note="Supabase health indicator" />
        <Metric label="Enabled agents" value={connected ? enabledAgents : "—"} note={connected ? agents.length + " definitions registered" : "Connect owner access"} />
        <Metric label="Active tasks" value={connected ? activeTasks : "—"} note={connected ? failedTasks + " failed in returned history" : "Connect owner access"} />
      </div>

      <SystemHealthCheck connected={connected} token={token} />
      {connected && <CompleteSystemTest token={token} />}

      <section className="surface-card p-5 sm:p-6">
        <div className="panel-heading">
          <div><p className="eyebrow">Access layer</p><h2 className="mt-2">Secure backend connection</h2><p>Authenticate with the owner token. It stays in page memory and is never saved in browser storage.</p></div>
          <span className={connected ? "workspace-status" : "rounded-full border border-[#c96b59]/30 bg-[#c96b59]/10 px-3 py-2 text-[10px] text-[#e3a092]"}>{connected ? "Owner verified" : "Disconnected"}</span>
        </div>
        {!connected ? <div className="flex flex-col gap-3 sm:flex-row">
          <input type="password" autoComplete="off" value={masterKey} onChange={(event) => setMasterKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void connect(); }} placeholder="Enter FS_OWNER_TOKEN" aria-label="Owner master token" className="min-w-0 flex-1 px-4 py-3 text-sm" />
          <button type="button" disabled={connecting || masterKey.length < 32} onClick={() => void connect()} className="action-primary">{connecting ? "Connecting…" : "Connect backend"}</button>
        </div> : <div className="flex flex-wrap items-center gap-3"><p className="text-sm text-[#a9c2a7]">Authenticated owner session is active in this page.</p><button type="button" onClick={disconnect} className="action-secondary">Disconnect</button><button type="button" onClick={() => void refresh()} className="action-secondary">Refresh data ↻</button></div>}
        <p className="mt-3 text-[10px] leading-5 text-stone-500">The owner token remains in memory only. Rotate it through the Render environment if it is exposed.</p>
      </section>

      {connected && <>
        <section className="grid gap-5 xl:grid-cols-2">
          <div className="surface-card p-5 sm:p-6">
            <div className="panel-heading"><div><p className="eyebrow">Device bridge</p><h2 className="mt-2">Pair an Android device</h2><p>Generate a single-use code for the Futuristic System app. It expires after five minutes.</p></div><span className="text-2xl text-[#c2a66b]">⌁</span></div>
            <button type="button" disabled={pairingBusy} onClick={() => void createPairingCode()} className="action-primary">{pairingBusy ? "Generating…" : pairingCode ? "Generate another code" : "Generate pairing code"}</button>
            {pairingCode && <div className="mt-4 rounded-xl border border-[#c2a66b]/25 bg-[#c2a66b]/[.06] p-4">
              <p className="text-[10px] text-stone-400">One-time pairing code · expires {new Date(pairingExpiresAt).toLocaleTimeString()}</p>
              <p className="mt-3 break-all font-mono text-sm text-stone-100 select-all">{pairingCode}</p>
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void navigator.clipboard.writeText(pairingCode)} className="action-secondary">Copy code</button><button type="button" onClick={() => { setPairingCode(""); setPairingExpiresAt(""); }} className="action-secondary">Hide code</button></div>
              <p className="mt-3 text-[10px] text-[#e1bd7e]">Treat this code like a password. Use it only in your own app.</p>
            </div>}
          </div>
          <div className="surface-card p-5 sm:p-6">
            <div className="panel-heading"><div><p className="eyebrow">Model credentials</p><h2 className="mt-2">AI provider access</h2><p>Credentials are encrypted on the server and never returned to this page.</p></div><span className="text-2xl text-[#a58bb9]">◈</span></div>
            <form onSubmit={saveKey} className="grid gap-3 sm:grid-cols-[130px_1fr]">
              <select value={provider} onChange={(event) => setProvider(event.target.value)} className="px-3 py-3 text-sm"><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option></select>
              <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} minLength={8} maxLength={4096} autoComplete="new-password" placeholder="Paste provider API key" className="min-w-0 px-3 py-3 text-sm" />
              <button disabled={!apiKey.trim()} className="action-primary sm:col-span-2">Save encrypted key</button>
            </form>
            <div className="mt-4 space-y-2">{providers.map((item) => <div key={item.provider} className="flex items-center justify-between gap-3 rounded-lg border border-white/[.08] px-3 py-3"><span className="text-xs capitalize text-stone-200">{item.provider} · configured</span><button type="button" onClick={() => void removeKey(item.provider)} className="text-[10px] font-semibold text-[#e3a092]">Remove</button></div>)}
              {providers.length === 0 && <p className="text-xs text-stone-500">No provider credentials configured. Safe local tools remain available.</p>}</div>
          </div>
        </section>

        <section className="surface-card p-5 sm:p-6">
          <div className="panel-heading"><div><p className="eyebrow">Agent runtime</p><h2 className="mt-2">Submit a task</h2><p>Describe the outcome. The backend plans, validates, executes approved tools and records the result.</p></div><Link href="/dashboard/agent-lab" className="action-secondary">Advanced workbench ↗</Link></div>
          <form onSubmit={runTask} className="space-y-3">
            <label className="block space-y-2 text-[11px] font-semibold text-stone-300"><span>Execution profile</span>
              <select value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)} disabled={!agentCatalogAvailable || agents.length === 0 || running} className="w-full px-4 py-3 text-sm">
                <option value="">Default planner (existing workflow)</option>
                {agents.map((agent) => <option key={agent.id} value={agent.id} disabled={!agent.enabled}>{agent.name}{agent.enabled ? "" : " (disabled)"}</option>)}
              </select>
              {!agentCatalogAvailable && <span className="block text-[10px] text-[#e1bd7e]">Agent definitions are unavailable until the Agent Manager database migration is applied.</span>}
              {agentCatalogAvailable && agents.length === 0 && <span className="block text-[10px] text-stone-500">No Agent definitions yet. Create one in Agent Manager.</span>}
            </label>
            <textarea value={task} onChange={(event) => setTask(event.target.value)} maxLength={4000} rows={4} placeholder="Describe what the backend should do…" className="w-full px-4 py-3 text-sm" />
            <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-[10px] text-stone-500">{task.length}/4000 characters</span><button disabled={running || !task.trim()} className="action-primary">{running ? "Executing task…" : "Run Agent task →"}</button></div>
          </form>
          {result && <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-[#8aa78b]/25 bg-[#8aa78b]/[.06] p-4 text-sm text-[#c1d5bf]">{result}</pre>}
        </section>

        <section className="surface-card p-5 sm:p-6">
          <div className="panel-heading"><div><p className="eyebrow">Execution ledger</p><h2 className="mt-2">Recent Agent tasks</h2><p>History returned by the owner API, with failure stage and diagnostic details where available.</p></div><button type="button" onClick={() => void refresh()} className="action-secondary">Refresh ↻</button></div>
          {tasks.length === 0 ? <p className="text-sm text-stone-500">No tasks have been executed yet.</p> : <div className="space-y-2">
            {tasks.map((item) => <article key={item.id} className="rounded-xl border border-white/[.08] bg-black/[.12] p-4">
              <div className="flex flex-wrap justify-between gap-2"><p className="min-w-0 flex-1 text-sm text-stone-200">{item.task}</p><span className={item.status === "failed" ? "text-[10px] font-bold uppercase text-[#e3a092]" : "text-[10px] font-bold uppercase text-[#a9c2a7]"}>{item.status.replace(/_/g, " ")}</span></div>
              {item.result && <pre className="mt-3 whitespace-pre-wrap text-xs leading-6 text-stone-400">{item.result}</pre>}
              {item.status === "failed" && <div className="mt-3 rounded-lg border border-[#c96b59]/20 bg-[#c96b59]/[.06] p-3" role="status"><p className="text-xs font-semibold text-[#e3a092]">Failure diagnostics</p>{item.failed_stage && <p className="mt-1 text-[10px] text-stone-300">Stage: {item.failed_stage.replace(/_/g, " ")}</p>}<p className="mt-1 whitespace-pre-wrap break-words text-xs text-[#e3a092]">{item.error_message ?? "Failure reason unavailable."}</p></div>}
              {item.agent_snapshot?.name && <p className="mt-2 text-[10px] text-[#d8bd83]">Agent: {item.agent_snapshot.name}</p>}
              <p className="mt-2 text-[9px] text-stone-600">{new Date(item.created_at).toLocaleString()}</p>
            </article>)}
          </div>}
        </section>

        <section className="surface-card p-5 sm:p-6">
          <div className="panel-heading"><div><p className="eyebrow">Capability registry</p><h2 className="mt-2">Registered backend tools</h2><p>Only registered capabilities are exposed to the Agent runtime.</p></div><span className="text-sm font-semibold text-[#d8bd83]">{tools.length} tools</span></div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{tools.map((item) => <article key={item.id} className="rounded-xl border border-white/[.08] bg-black/[.12] p-4"><p className="break-all font-mono text-xs font-semibold text-[#d8bd83]">{item.id}</p><p className="mt-2 text-[11px] leading-5 text-stone-400">{item.description}</p><p className="mt-3 text-[9px] uppercase tracking-wide text-stone-600">Permission: {item.permission} · {item.sideEffect ? "Side effects" : "Read-only"}</p></article>)}</div>
        </section>
      </>}

      {error && <p role="alert" className="rounded-xl border border-[#c96b59]/30 bg-[#c96b59]/[.08] p-4 text-sm text-[#e3a092]">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-[#8aa78b]/25 bg-[#8aa78b]/[.07] p-4 text-sm text-[#b7cdb5]">{message}</p>}
    </div>
  );
}
