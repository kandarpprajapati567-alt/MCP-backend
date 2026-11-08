"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

type Task = { id: string; status: string; task: string; result: string | null; created_at: string };
type Provider = { provider: string; updated_at: string };
type Health = { status?: string; services?: { database?: string; authentication?: string } };
type Tool = { id: string; description: string; permission: string; sideEffect: boolean };

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
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingExpiresAt, setPairingExpiresAt] = useState("");
  const [pairingBusy, setPairingBusy] = useState(false);

  const api = useCallback(
    async (path: string, init: RequestInit = {}) =>
      fetch(path, {
        ...init,
        cache: "no-store",
        headers: {
          ...(init.headers ?? {}),
          "x-fs-owner-token": token,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      }),
    [token],
  );

  const disconnect = useCallback(() => {
    setToken("");
    setConnected(false);
    setTasks([]);
    setProviders([]);
    setTools([]);
    setResult("");
    setMessage("Backend disconnected.");
  }, []);

  const refresh = useCallback(async () => {
    const [taskResponse, providerResponse, toolResponse] = await Promise.all([
      api("/api/v1/agent/tasks"),
      api("/api/v1/ai/providers/keys"),
      api("/api/v1/tools"),
    ]);
    if ([taskResponse, providerResponse, toolResponse].some((response) => response.status === 401)) {
      disconnect();
      throw new Error("Owner master token was rejected. Connect again.");
    }
    if (!taskResponse.ok || !providerResponse.ok || !toolResponse.ok) {
      throw new Error("Backend data is temporarily unavailable.");
    }
    const taskData = await taskResponse.json();
    const providerData = await providerResponse.json();
    const toolData = await toolResponse.json();
    setTasks(taskData.tasks ?? []);
    setProviders(providerData.providers ?? []);
    setTools(toolData.tools ?? []);
  }, [api, disconnect]);

  useEffect(() => {
    fetch("/api/v1/health", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: Health) => setHealth(data))
      .catch(() => setHealth({ status: "unavailable" }));
  }, []);

  useEffect(() => {
    if (connected) void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Refresh failed."));
  }, [connected, refresh]);

  async function connect() {
    setConnecting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/tools", {
        headers: { "x-fs-owner-token": masterKey },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Owner token rejected.");
      setToken(masterKey);
      setTools(data.tools ?? []);
      setConnected(true);
      setMasterKey("");
      setMessage("Connected to MCP backend. No four-day session is created.");
    } catch (cause) {
      setConnected(false);
      setError(cause instanceof Error ? cause.message : "Could not connect.");
    } finally {
      setConnecting(false);
    }
  }

  async function createPairingCode() {
    setPairingBusy(true);
    setError("");
    setMessage("");
    setPairingCode("");
    setPairingExpiresAt("");
    try {
      const response = await api("/api/v1/devices/pairing", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create a pairing code.");
      setPairingCode(data.pairingCode);
      setPairingExpiresAt(data.expiresAt);
      setMessage("One-time device pairing code created. It expires in five minutes.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a pairing code.");
    } finally {
      setPairingBusy(false);
    }
  }

  async function runTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunning(true);
    setError("");
    setResult("");
    try {
      const response = await api("/api/v1/agent/tasks", {
        method: "POST",
        body: JSON.stringify({ task }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Task execution failed.");
      setResult(data.status === "waiting_for_device"
        ? data.message ?? "Task is waiting for a connected device."
        : data.result ?? "Task completed.");
      setTask("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Task execution failed.");
    } finally {
      setRunning(false);
    }
  }

  async function saveKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const response = await api("/api/v1/ai/providers/keys", {
        method: "PUT",
        body: JSON.stringify({ provider, apiKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save provider key.");
      setApiKey("");
      setMessage(provider + " credential encrypted and saved.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save provider key.");
    }
  }

  async function removeKey(name: string) {
    if (!window.confirm("Remove saved " + name + " credential?")) return;
    try {
      const response = await api("/api/v1/ai/providers/keys", {
        method: "DELETE",
        body: JSON.stringify({ provider: name }),
      });
      if (!response.ok) throw new Error("Could not remove provider key.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove provider key.");
    }
  }

  const databaseStatus = health.services?.database ?? "checking";
  const backendStatus = health.status ?? "checking";

  return (
    <div className="dashboard-page mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="System Overview"
        description="Your private AI infrastructure at a glance — backend health, connected capabilities, providers and agent activity."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-zinc-950/70 p-4">
          <p className="text-xs text-zinc-500">Backend status</p>
          <p className="mt-2 text-xl font-semibold text-white">{backendStatus}</p>
          <p className="mt-1 text-xs text-zinc-500">Live health endpoint</p>
        </div>
        <div className="rounded-2xl border border-border bg-zinc-950/70 p-4">
          <p className="text-xs text-zinc-500">Database</p>
          <p className="mt-2 text-xl font-semibold text-white">{databaseStatus}</p>
          <p className="mt-1 text-xs text-zinc-500">Supabase PostgreSQL</p>
        </div>
        <div className="rounded-2xl border border-border bg-zinc-950/70 p-4">
          <p className="text-xs text-zinc-500">Registered tools</p>
          <p className="mt-2 text-xl font-semibold text-white">{connected ? tools.length : "—"}</p>
          <p className="mt-1 text-xs text-zinc-500">Allow-listed backend tools</p>
        </div>
        <div className="rounded-2xl border border-border bg-zinc-950/70 p-4">
          <p className="text-xs text-zinc-500">AI providers</p>
          <p className="mt-2 text-xl font-semibold text-white">{connected ? providers.length : "—"}</p>
          <p className="mt-1 text-xs text-zinc-500">Encrypted server-side credentials</p>
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-900/50 bg-gradient-to-br from-cyan-950/40 via-zinc-950/80 to-violet-950/30 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Backend connection</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Personal owner access</h2>
            <p className="mt-1 text-sm text-zinc-400">No signup, login or expiring four-day session.</p>
          </div>
          <span className={connected ? "rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300" : "rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-300"}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        {!connected ? (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input
              type="password"
              autoComplete="off"
              value={masterKey}
              onChange={(event) => setMasterKey(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void connect(); }}
              placeholder="Enter FS_OWNER_TOKEN"
              aria-label="Owner master token"
              className="min-w-0 flex-1 rounded-xl border border-border bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-600"
            />
            <button
              type="button"
              disabled={connecting || masterKey.length < 32}
              onClick={() => void connect()}
              className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40"
            >
              {connecting ? "Connecting…" : "Connect backend"}
            </button>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <p className="text-sm text-emerald-300">Master token verified · connection active in this page</p>
            <button type="button" onClick={disconnect} className="rounded-lg border border-border px-3 py-2 text-xs text-zinc-300">Disconnect</button>
          </div>
        )}
        <p className="mt-3 text-xs text-zinc-500">The master token remains in page memory only; it is not written to browser storage. Set or rotate it later in Render environment variables.</p>
      </section>

      {connected && (
        <section className="rounded-2xl border border-cyan-900/50 bg-zinc-950/70 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Secure device pairing</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Connect your Android phone once</h2>
          <p className="mt-1 text-sm text-zinc-400">Create a one-time code here, enter it in Futuristic System on your phone, and the app will keep its device credential securely for automatic reconnection.</p>
          <button type="button" disabled={pairingBusy} onClick={() => void createPairingCode()} className="mt-4 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40">
            {pairingBusy ? "Creating code…" : pairingCode ? "Generate a new code" : "Generate pairing code"}
          </button>
          {pairingCode && (
            <div className="mt-4 rounded-xl border border-border bg-black/40 p-4">
              <p className="text-xs text-zinc-400">One-time code · expires {new Date(pairingExpiresAt).toLocaleTimeString()}</p>
              <p className="mt-2 break-all font-mono text-sm text-white select-all">{pairingCode}</p>
              <button type="button" onClick={() => void navigator.clipboard.writeText(pairingCode)} className="mt-3 rounded-lg border border-border px-3 py-2 text-xs text-zinc-200">Copy pairing code</button>
              <button type="button" onClick={() => { setPairingCode(""); setPairingExpiresAt(""); }} className="ml-2 rounded-lg border border-border px-3 py-2 text-xs text-zinc-400">Hide code</button>
              <p className="mt-3 text-xs text-amber-300">Treat this code like a password. Use it only in your own app. It can be used once.</p>
            </div>
          )}
        </section>
      )}

      {connected && (
        <>
          <section className="rounded-2xl border border-border bg-zinc-950/70 p-5 sm:p-6">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Agent runtime</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Execute a task</h2>
              <p className="mt-1 text-sm text-zinc-400">Task → planner → registered tools → synthesis → persistent history.</p>
            </div>
            <form onSubmit={runTask} className="space-y-3">
              <textarea
                value={task}
                onChange={(event) => setTask(event.target.value)}
                maxLength={4000}
                rows={4}
                placeholder="Describe what the backend should do…"
                className="w-full rounded-xl border border-border bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-600"
              />
              <button disabled={running || !task.trim()} className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40">
                {running ? "Executing task…" : "Run agent task"}
              </button>
            </form>
            {result && <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4 text-sm text-emerald-200">{result}</pre>}
          </section>

          <section className="rounded-2xl border border-border bg-zinc-950/70 p-5 sm:p-6">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Model layer</p>
              <h2 className="mt-1 text-lg font-semibold text-white">AI provider credentials</h2>
              <p className="mt-1 text-sm text-zinc-400">OpenAI and OpenRouter adapters are active. Keys are encrypted on the server and never returned to the browser.</p>
            </div>
            <form onSubmit={saveKey} className="grid gap-3 sm:grid-cols-[160px_1fr_auto]">
              <select value={provider} onChange={(event) => setProvider(event.target.value)} className="rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white">
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
              </select>
              <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} minLength={8} maxLength={4096} autoComplete="new-password" placeholder="Paste provider API key" className="min-w-0 rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white placeholder:text-zinc-600" />
              <button disabled={!apiKey.trim()} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40">Save encrypted key</button>
            </form>
            <div className="mt-4 space-y-2">
              {providers.map((item) => (
                <div key={item.provider} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <span className="text-sm capitalize text-zinc-200">{item.provider} · configured</span>
                  <button type="button" onClick={() => void removeKey(item.provider)} className="text-xs text-red-300">Remove</button>
                </div>
              ))}
              {providers.length === 0 && <p className="text-xs text-zinc-500">No provider credentials configured yet. Safe local tools remain available.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-zinc-950/70 p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Execution history</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Recent agent tasks</h2>
              </div>
              <button type="button" onClick={() => void refresh()} className="text-xs text-cyan-300">Refresh</button>
            </div>
            {tasks.length === 0 ? <p className="text-sm text-zinc-500">No tasks have been executed yet.</p> : (
              <div className="space-y-2">
                {tasks.map((item) => (
                  <article key={item.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="text-sm text-zinc-200">{item.task}</p>
                      <span className="text-xs text-emerald-300">{item.status}</span>
                    </div>
                    {item.result && <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-400">{item.result}</pre>}
                    <p className="mt-2 text-[10px] text-zinc-600">{new Date(item.created_at).toLocaleString()}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-zinc-950/70 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Registered backend tools</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {tools.map((item) => (
                <article key={item.id} className="rounded-xl border border-border p-3">
                  <p className="text-sm font-medium text-cyan-200">{item.id}</p>
                  <p className="mt-1 text-xs text-zinc-400">{item.description}</p>
                  <p className="mt-2 text-[10px] text-zinc-600">Permission: {item.permission} · {item.sideEffect ? "Side effects" : "Read-only"}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {error && <p role="alert" className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-3 text-sm text-emerald-300">{message}</p>}
    </div>
  );
}
