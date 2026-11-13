"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

type Device = {
  device_id: string;
  display_name: string;
  platform: string;
  app_version: string | null;
  capabilities: Array<{ id: string; description: string; permission: string }>;
  status: string;
  last_seen_at: string | null;
};
type Memory = {
  id: string;
  namespace: string;
  memory_key: string;
  content: string;
  importance: number;
  source: string;
  updated_at: string;
};

export default function DatabasePage() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [namespace, setNamespace] = useState("default");
  const [query, setQuery] = useState("");
  const [memoryKey, setMemoryKey] = useState("");
  const [memoryContent, setMemoryContent] = useState("");
  const [importance, setImportance] = useState(3);

  async function load(search = query) {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ namespace, limit: "30" });
      if (search.trim()) params.set("q", search.trim());
      const [deviceResponse, memoryResponse] = await Promise.all([
        fetch("/api/v1/devices", { headers: { "x-fs-owner-token": token }, cache: "no-store" }),
        fetch("/api/v1/memory?" + params.toString(), { headers: { "x-fs-owner-token": token }, cache: "no-store" }),
      ]);
      const [deviceData, memoryData] = await Promise.all([deviceResponse.json(), memoryResponse.json()]);
      if (!deviceResponse.ok) throw new Error(deviceData.error ?? "Device registry unavailable.");
      if (!memoryResponse.ok) throw new Error(memoryData.error ?? "Memory store unavailable.");
      setDevices(deviceData.devices ?? []);
      setMemories(memoryData.memories ?? []);
      setConnected(true);
    } catch (cause) {
      setConnected(false);
      setError(cause instanceof Error ? cause.message : "Could not load database data.");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    await load("");
  }
  useEffect(() => {
    let active = true;
    fetch("/api/v1/session", { cache: "no-store" }).then((response) => response.json())
      .then((session: { authenticated?: boolean }) => { if (active && session.authenticated) void load(""); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function saveMemory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/memory", {
        method: "POST",
        headers: { "x-fs-owner-token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ namespace, key: memoryKey, content: memoryContent, importance, source: "manual" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Memory could not be saved.");
      setMemoryKey("");
      setMemoryContent("");
      setMessage("Memory saved.");
      await load("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Memory could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMemory(key: string) {
    if (!window.confirm("Delete memory " + key + "?")) return;
    setError("");
    try {
      const response = await fetch("/api/v1/memory", {
        method: "DELETE",
        headers: { "x-fs-owner-token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ namespace, key }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Memory could not be deleted.");
      setMessage(data.deleted ? "Memory deleted." : "No matching memory was found.");
      await load("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Memory could not be deleted.");
    }
  }

  async function markOffline(deviceId: string) {
    try {
      const response = await fetch("/api/v1/devices", {
        method: "DELETE",
        headers: { "x-fs-owner-token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      if (!response.ok) throw new Error("Device status could not be updated.");
      await load("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Device status could not be updated.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Memory & Devices" description="Persistent owner memory and the device capability registry for connected Android and Windows clients." />
      {!connected && (
        <section className="rounded-2xl border border-border bg-zinc-950/70 p-5">
          <h2 className="font-semibold text-white">Connect to backend data</h2>
          <p className="mt-1 text-sm text-zinc-400">The owner token stays in this page's memory only.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="FS_OWNER_TOKEN" className="min-w-0 flex-1 rounded-xl border border-border bg-black/30 px-4 py-3 text-sm text-white" />
            <button type="button" disabled={busy || token.length < 32} onClick={() => void connect()} className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40">{busy ? "Loading…" : "Connect"}</button>
          </div>
        </section>
      )}
      {connected && (
        <>
          <section className="rounded-2xl border border-border bg-zinc-950/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Registered devices</h2>
                <p className="mt-1 text-sm text-zinc-400">Android clients can register their available tools and poll queued execution jobs.</p>
              </div>
              <button type="button" onClick={() => void load("")} className="text-xs text-cyan-300">Refresh devices</button>
            </div>
            {devices.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No device has registered yet. The Android app can register through POST /api/v1/devices.</p> : (
              <div className="mt-4 space-y-2">
                {devices.map((device) => (
                  <article key={device.device_id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-white">{device.display_name}</p>
                        <p className="mt-1 text-xs text-zinc-500">{device.platform} · {device.device_id} · {device.app_version ?? "version not supplied"}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={device.status === "online" ? "text-xs text-emerald-300" : "text-xs text-zinc-500"}>{device.status}</span>
                        <button type="button" onClick={() => void markOffline(device.device_id)} className="text-xs text-zinc-400">Mark offline</button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {device.capabilities?.map((capability) => <span key={capability.id} className="rounded-full border border-border px-2 py-1 text-[10px] text-cyan-200">{capability.id}</span>)}
                    </div>
                    <p className="mt-2 text-[10px] text-zinc-600">Last heartbeat: {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "never"}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-border bg-zinc-950/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Persistent memory</h2>
                <p className="mt-1 text-sm text-zinc-400">Owner-scoped key/value knowledge with text search and importance ranking.</p>
              </div>
              <span className="text-xs text-zinc-500">{memories.length} loaded</span>
            </div>
            <form onSubmit={saveMemory} className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-xs text-zinc-400">Namespace<input value={namespace} onChange={(event) => setNamespace(event.target.value)} maxLength={80} className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-white" /></label>
                <label className="space-y-1 text-xs text-zinc-400">Memory key<input required value={memoryKey} onChange={(event) => setMemoryKey(event.target.value)} maxLength={160} placeholder="e.g. preferred_model" className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-white" /></label>
                <label className="space-y-1 text-xs text-zinc-400">Importance: {importance}<input type="range" min={1} max={5} value={importance} onChange={(event) => setImportance(Number(event.target.value))} className="mt-2 w-full" /></label>
              </div>
              <textarea required value={memoryContent} onChange={(event) => setMemoryContent(event.target.value)} maxLength={12000} rows={3} placeholder="Write the information to remember…" className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" />
              <button disabled={busy || !memoryKey.trim() || !memoryContent.trim()} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40">Save memory</button>
            </form>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} placeholder="Search memory content…" className="min-w-0 flex-1 rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-white" />
              <button type="button" onClick={() => void load()} className="rounded-lg border border-border px-4 py-2 text-sm text-zinc-300">Search</button>
            </div>
            <div className="mt-4 space-y-2">
              {memories.map((memory) => (
                <article key={memory.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><p className="text-sm font-medium text-cyan-200">{memory.memory_key}</p><p className="text-[10px] text-zinc-500">{memory.namespace} · {memory.source} · importance {memory.importance}</p></div>
                    <button type="button" onClick={() => void deleteMemory(memory.memory_key)} className="text-xs text-red-300">Delete</button>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{memory.content}</p>
                </article>
              ))}
              {memories.length === 0 && <p className="text-sm text-zinc-500">No memories found in this namespace.</p>}
            </div>
          </section>
        </>
      )}
      {error && <p role="alert" className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-3 text-sm text-emerald-300">{message}</p>}
    </div>
  );
}
