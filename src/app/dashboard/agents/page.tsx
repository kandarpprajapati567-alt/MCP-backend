"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

type Agent = {
  id: string;
  name: string;
  description: string;
  role: string;
  instructions: string;
  provider_preference: string;
  model_preference: string | null;
  allowed_tools: string[];
  max_steps: number;
  max_tool_calls: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type Draft = {
  name: string;
  description: string;
  role: string;
  instructions: string;
  providerPreference: string;
  modelPreference: string;
  maxSteps: number;
  maxToolCalls: number;
  enabled: boolean;
};

const emptyDraft: Draft = {
  name: "",
  description: "",
  role: "",
  instructions: "",
  providerPreference: "auto",
  modelPreference: "",
  maxSteps: 8,
  maxToolCalls: 4,
  enabled: true,
};

export default function AgentsPage() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function request(path: string, init: RequestInit = {}) {
    return fetch(path, {
      ...init,
      cache: "no-store",
      headers: {
        "x-fs-owner-token": token,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  }

  async function loadAgents() {
    const response = await request("/api/v1/agents");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load agents.");
    setAgents(data.agents ?? []);
  }

  async function connect() {
    setBusy(true);
    setError("");
    try {
      await loadAgents();
      setConnected(true);
      setMessage("Secure owner connection verified. Agent definitions loaded.");
    } catch (cause) {
      setConnected(false);
      setError(cause instanceof Error ? cause.message : "Could not connect.");
    } finally {
      setBusy(false);
    }
  }

  function beginCreate() {
    setEditingId(null);
    setDraft(emptyDraft);
    setShowEditor(true);
    setError("");
    setMessage("");
  }

  function beginEdit(agent: Agent) {
    setEditingId(agent.id);
    setDraft({
      name: agent.name,
      description: agent.description,
      role: agent.role,
      instructions: agent.instructions,
      providerPreference: agent.provider_preference,
      modelPreference: agent.model_preference ?? "",
      maxSteps: agent.max_steps,
      maxToolCalls: agent.max_tool_calls,
      enabled: agent.enabled,
    });
    setShowEditor(true);
    setError("");
    setMessage("");
  }

  async function saveAgent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await request(
        editingId ? "/api/v1/agents/" + editingId : "/api/v1/agents",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify({
            ...draft,
            modelPreference: draft.modelPreference.trim() || null,
            allowedTools: editingId ? agents.find((agent) => agent.id === editingId)?.allowed_tools ?? [] : [],
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Agent could not be saved.");
      await loadAgents();
      setShowEditor(false);
      setEditingId(null);
      setDraft(emptyDraft);
      setMessage(editingId ? "Agent updated successfully." : "Agent created successfully.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAgent(agent: Agent) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await request("/api/v1/agents/" + agent.id, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !agent.enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Agent status could not be changed.");
      await loadAgents();
      setMessage(agent.name + (agent.enabled ? " paused." : " enabled."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent status could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAgent(agent: Agent) {
    if (!window.confirm("Permanently delete agent '" + agent.name + "'?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await request("/api/v1/agents/" + agent.id, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Agent could not be deleted.");
      await loadAgents();
      setMessage(agent.name + " deleted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Agent Manager"
        description="Create and manage persistent specialist agents. Each definition stores its role, instructions, model preference and execution limits."
      />

      {!connected ? (
        <section className="rounded-2xl border border-border bg-zinc-950/70 p-5">
          <h2 className="text-base font-semibold text-white">Secure backend connection</h2>
          <p className="mt-1 text-sm text-zinc-400">Enter your owner master token. It remains in this page's memory only.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="FS_OWNER_TOKEN"
              aria-label="Owner master token"
              className="min-w-0 flex-1 rounded-xl border border-border bg-black/30 px-4 py-3 text-sm text-white"
            />
            <button type="button" disabled={busy || token.length < 32} onClick={() => void connect()} className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40">
              {busy ? "Connecting…" : "Connect Agent Manager"}
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-zinc-950/70 p-4">
            <div>
              <p className="text-sm font-semibold text-white">Owner access connected</p>
              <p className="mt-1 text-xs text-zinc-500">{agents.length} saved agent{agents.length === 1 ? "" : "s"} · private server-side storage</p>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void loadAgents().catch((cause) => setError(cause instanceof Error ? cause.message : "Refresh failed."))} className="rounded-xl border border-border px-3 py-2 text-xs text-zinc-300">Refresh</button>
              <button type="button" onClick={beginCreate} className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-semibold text-zinc-950">+ Create agent</button>
            </div>
          </section>

          {showEditor && (
            <form onSubmit={saveAgent} className="space-y-4 rounded-2xl border border-cyan-900/50 bg-zinc-950/80 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-white">{editingId ? "Edit agent" : "Create specialist agent"}</h2>
                <button type="button" onClick={() => setShowEditor(false)} className="text-xs text-zinc-400">Close</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-zinc-400">Agent name
                  <input required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Research Analyst" className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" />
                </label>
                <label className="space-y-1 text-xs text-zinc-400">Specialist role
                  <input required maxLength={120} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} placeholder="Research specialist" className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" />
                </label>
              </div>
              <label className="block space-y-1 text-xs text-zinc-400">Short description
                <input maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="What this agent is responsible for" className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" />
              </label>
              <label className="block space-y-1 text-xs text-zinc-400">System instructions
                <textarea required minLength={1} maxLength={12000} rows={5} value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} placeholder="Define the agent's responsibilities, boundaries and expected output…" className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-zinc-400">Provider preference
                  <select value={draft.providerPreference} onChange={(event) => setDraft({ ...draft, providerPreference: event.target.value })} className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white">
                    <option value="auto">Automatic routing</option>
                    <option value="openai">OpenAI</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="mock">Local / mock fallback</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-zinc-400">Preferred model (optional)
                  <input maxLength={160} value={draft.modelPreference} onChange={(event) => setDraft({ ...draft, modelPreference: event.target.value })} placeholder="e.g. gpt-4o-mini" className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-zinc-400">Maximum planning steps
                  <select value={draft.maxSteps} onChange={(event) => setDraft({ ...draft, maxSteps: Number(event.target.value) })} className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white">
                    {[1,2,3,4,5,6,7,8].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-zinc-400">Maximum tool calls
                  <select value={draft.maxToolCalls} onChange={(event) => setDraft({ ...draft, maxToolCalls: Number(event.target.value) })} className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white">
                    {[0,1,2,3,4].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} className="h-4 w-4 accent-cyan-400" />
                Agent enabled
              </label>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40">{busy ? "Saving…" : editingId ? "Save changes" : "Create agent"}</button>
                <button type="button" disabled={busy} onClick={() => { setShowEditor(false); setEditingId(null); }} className="rounded-xl border border-border px-4 py-2.5 text-sm text-zinc-300">Cancel</button>
              </div>
            </form>
          )}

          {agents.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-border bg-zinc-950/40 p-10 text-center">
              <p className="text-base font-semibold text-white">No agents created yet</p>
              <p className="mt-2 text-sm text-zinc-500">Create your first specialist agent. Its configuration will be saved in Supabase.</p>
              <button type="button" onClick={beginCreate} className="mt-5 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950">Create your first agent</button>
            </section>
          ) : (
            <section className="grid gap-3 md:grid-cols-2">
              {agents.map((agent) => (
                <article key={agent.id} className="rounded-2xl border border-border bg-zinc-950/70 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold text-white">{agent.name}</h2>
                      <p className="mt-1 text-xs text-cyan-200">{agent.role}</p>
                    </div>
                    <span className={agent.enabled ? "rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] text-emerald-300" : "rounded-full bg-zinc-700/40 px-2.5 py-1 text-[10px] text-zinc-400"}>{agent.enabled ? "Enabled" : "Paused"}</span>
                  </div>
                  <p className="mt-3 min-h-10 text-sm text-zinc-400">{agent.description || "No description provided."}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border p-2"><p className="text-zinc-500">Provider</p><p className="mt-1 capitalize text-zinc-200">{agent.provider_preference}</p></div>
                    <div className="rounded-lg border border-border p-2"><p className="text-zinc-500">Execution limits</p><p className="mt-1 text-zinc-200">{agent.max_steps} steps · {agent.max_tool_calls} calls</p></div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs text-zinc-500">{agent.instructions}</p>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                    <button type="button" disabled={busy} onClick={() => beginEdit(agent)} className="rounded-lg border border-border px-3 py-2 text-xs text-zinc-300">Edit</button>
                    <button type="button" disabled={busy} onClick={() => void toggleAgent(agent)} className="rounded-lg border border-border px-3 py-2 text-xs text-zinc-300">{agent.enabled ? "Pause" : "Enable"}</button>
                    <button type="button" disabled={busy} onClick={() => void deleteAgent(agent)} className="rounded-lg border border-red-900/50 px-3 py-2 text-xs text-red-300">Delete</button>
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}

      {error && <p role="alert" className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-3 text-sm text-emerald-300">{message}</p>}
    </div>
  );
}
