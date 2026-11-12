"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

type Connection = { id: string; name: string; category: string; connected: boolean; status: string; tools: string[]; setup: string };
type RemoteServer = { id: string; name: string; endpoint: string; enabled: boolean; tools: Array<{ id: string; description: string }>; createdAt: string };

export default function ConnectionsPage() {
  const [token, setToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [remoteName, setRemoteName] = useState("");
  const [remoteEndpoint, setRemoteEndpoint] = useState("");
  const [remoteToken, setRemoteToken] = useState("");
  const [remoteServers, setRemoteServers] = useState<RemoteServer[]>([]);

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
    const remoteResponse = await request("/api/v1/connections/remote-mcp");
    if (remoteResponse.ok) { const remoteData = await remoteResponse.json(); setRemoteServers(remoteData.servers ?? []); } else { setRemoteServers([]); }
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

  async function connectRemoteMcp() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await request("/api/v1/connections/remote-mcp", { method: "POST", body: JSON.stringify({ name: remoteName, endpoint: remoteEndpoint, ...(remoteToken ? { bearerToken: remoteToken } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Remote MCP connection failed.");
      setRemoteName(""); setRemoteEndpoint(""); setRemoteToken("");
      await refresh(); setMessage("Remote MCP connected. " + (data.tools?.length ?? 0) + " read-only tool(s) discovered.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Remote MCP connection failed."); }
    finally { setBusy(false); }
  }

  async function disconnectRemoteMcp(server: RemoteServer) {
    if (!window.confirm("Disconnect remote MCP server '" + server.name + "'?")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await request("/api/v1/connections/remote-mcp", { method: "DELETE", body: JSON.stringify({ serverId: server.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Remote MCP disconnect failed.");
      await refresh(); setMessage(server.name + " disconnected.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Remote MCP disconnect failed."); }
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
    <section className="space-y-4 rounded-2xl border border-border bg-zinc-950/70 p-5">
      <div><p className="text-xs uppercase tracking-wide text-zinc-500">MCP</p><h2 className="mt-1 text-lg font-semibold text-white">Remote MCP servers</h2><p className="mt-1 text-sm text-zinc-400">Register public HTTPS Streamable HTTP servers. DNS is pinned to validated public IPv4 addresses, redirects are blocked, bearer credentials are encrypted, and only explicitly read-only tools are exposed.</p></div>
      <form onSubmit={(event) => { event.preventDefault(); void connectRemoteMcp(); }} className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-zinc-400">Server name<input required maxLength={80} value={remoteName} onChange={(event) => setRemoteName(event.target.value)} placeholder="Research MCP" className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" /></label>
        <label className="space-y-1 text-xs text-zinc-400">HTTPS endpoint<input required type="url" value={remoteEndpoint} onChange={(event) => setRemoteEndpoint(event.target.value)} placeholder="https://mcp.example.com/mcp" className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" /></label>
        <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">Bearer token (optional)<input type="password" autoComplete="off" value={remoteToken} onChange={(event) => setRemoteToken(event.target.value)} placeholder="Server access token" className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" /></label>
        <div className="sm:col-span-2"><button disabled={busy || !remoteName.trim() || !remoteEndpoint.trim()} className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40">{busy ? "Connecting…" : "Validate & connect server"}</button></div>
      </form>
      <p className="text-xs text-amber-300/80">HTTPS port 443 only · public IPv4 DNS only · no redirects · 12-second timeout · 1 MB response cap. Write-capable or unannotated tools are excluded.</p>
      {remoteServers.map((server) => <div key={server.id} className="space-y-2 rounded-xl border border-border/80 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-white">{server.name}</p><p className="mt-1 break-all text-xs text-zinc-500">{server.endpoint}</p></div><button type="button" disabled={busy} onClick={() => void disconnectRemoteMcp(server)} className="rounded-lg border border-red-900/60 px-3 py-2 text-xs text-red-300 disabled:opacity-40">Disconnect</button></div>
        <p className="text-xs text-zinc-500">{server.tools.length} read-only tool(s) discovered</p>
        <div className="flex flex-wrap gap-2">{server.tools.map((tool) => <code key={tool.id} title={tool.description} className="rounded-md bg-black/40 px-2 py-1 text-xs text-cyan-200">{tool.id}</code>)}</div>
      </div>)}
      {remoteServers.length === 0 && <p className="text-xs text-zinc-500">No remote MCP servers connected.</p>}
    </section>
    </>}
    {error && <p role="alert" className="rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3 text-sm text-emerald-300">{message}</p>}
  </div>;
}
