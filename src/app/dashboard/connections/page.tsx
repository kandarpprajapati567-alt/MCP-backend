"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

type Connection = { id: string; name: string; category: string; connected: boolean; status: string; tools: string[]; setup: string };

export default function ConnectionsPage() {
  const [token, setToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function request(path: string, init: RequestInit = {}) {
    return fetch(path, { ...init, cache: "no-store", headers: {
      "x-fs-owner-token": token,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    } });
  }

  async function refresh() {
    const response = await request("/api/v1/connections");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Connections could not be loaded.");
    setConnections(data.connections ?? []);
  }

  async function connectOwner() {
    setBusy(true); setError(""); setMessage("");
    try { await refresh(); setConnected(true); setMessage("Connections Hub connected."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Connection failed."); }
    finally { setBusy(false); }
  }

  async function saveTavily() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await request("/api/v1/connections", { method: "PUT", body: JSON.stringify({ provider: "tavily", apiKey }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Web Search could not be connected.");
      setApiKey(""); await refresh(); setMessage("Web Search connected. The API key is stored encrypted and is never returned.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Web Search connection failed."); }
    finally { setBusy(false); }
  }

  async function disconnectTavily() {
    if (!window.confirm("Disconnect Web Search? Agents will no longer be able to use web.search.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await request("/api/v1/connections", { method: "DELETE", body: JSON.stringify({ provider: "tavily" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Disconnect failed.");
      await refresh(); setMessage("Web Search disconnected.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Disconnect failed."); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-6xl space-y-5">
    <PageHeader title="Connections Hub" description="Connect external services once, then assign their tools to individual Agents." />
    {!connected ? <section className="rounded-2xl border border-border bg-zinc-950/70 p-5">
      <h2 className="font-semibold text-white">Secure owner connection</h2>
      <p className="mt-1 text-sm text-zinc-400">Enter your owner master token. It remains in this page's memory only.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="FS_OWNER_TOKEN" aria-label="Owner master token" className="min-w-0 flex-1 rounded-xl border border-border bg-black/30 px-4 py-3 text-sm text-white" />
        <button disabled={busy || token.length < 32} onClick={() => void connectOwner()} className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40">{busy ? "Connecting…" : "Connect"}</button>
      </div>
    </section> : <>
      <section className="flex items-center justify-between rounded-2xl border border-border bg-zinc-950/70 p-4">
        <div><p className="text-sm font-semibold text-white">Owner access connected</p><p className="mt-1 text-xs text-zinc-500">Credentials are encrypted server-side. Secret values are never sent back to this page.</p></div>
        <button disabled={busy} onClick={() => void refresh().catch(e => setError(e.message))} className="rounded-lg border border-border px-3 py-2 text-xs text-zinc-300">Refresh</button>
      </section>
      {connections.map(item => <section key={item.id} className="space-y-3 rounded-2xl border border-border bg-zinc-950/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-xs uppercase tracking-wide text-zinc-500">{item.category}</p><h2 className="mt-1 text-lg font-semibold text-white">{item.name}</h2></div>
          <span className={"rounded-full px-3 py-1 text-xs " + (item.connected ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-300")}>{item.status.replaceAll("_", " ")}</span>
        </div>
        <p className="text-sm text-zinc-400">{item.setup}</p>
        {item.tools.length > 0 && <div className="flex flex-wrap gap-2">{item.tools.map(tool => <code key={tool} className="rounded-md bg-black/40 px-2 py-1 text-xs text-cyan-200">{tool}</code>)}</div>}
        {item.id === "tavily" && (item.connected ? <button disabled={busy} onClick={() => void disconnectTavily()} className="rounded-lg border border-red-900/60 px-3 py-2 text-xs text-red-300 disabled:opacity-40">Disconnect Web Search</button> : <div className="flex flex-col gap-2 sm:flex-row">
          <input type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Tavily API key" aria-label="Tavily API key" className="min-w-0 flex-1 rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" />
          <button disabled={busy || apiKey.length < 8} onClick={() => void saveTavily()} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40">Connect Web Search</button>
        </div>)}
      </section>)}
    </>}
    {error && <p role="alert" className="rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3 text-sm text-emerald-300">{message}</p>}
  </div>;
}
