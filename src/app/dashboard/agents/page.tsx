"use client";

import { useEffect, useState } from "react";
import { hasOwnerSession, openOwnerSession, ownerFetch } from "@/lib/client/owner-session";
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
type ToolTarget = "backend" | "remote_mcp" | "device";
type Tool = {
  id: string;
  description: string;
  sideEffect: boolean;
  permission: string;
  target: ToolTarget;
  available: boolean;
  availabilityNote?: string;
};
type ToolAccessReport = {
  tools: Array<Tool & {
    assigned: boolean;
    status: string;
    assignmentDecision: "allowlisted" | "denied";
    denialReasons: string[];
    risk: "read_only" | "side_effect";
  }>;
  unavailableAssignments: string[];
  summary: {
    total: number;
    assigned: number;
    available: number;
    allowlisted: number;
    denied: number;
    assignmentRequired: number;
    unavailable: number;
    assignedUnavailable: number;
  };
  sources: { backend: string; remoteMcp: string; devices: string };
  policy: string;
  availabilityPolicy: string;
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
  allowedTools: string[];
};

const emptyDraft: Draft = {
  name: "",
  description: "",
  role: "",
  instructions: "",
  providerPreference: "auto",
  modelPreference: "",
  maxSteps: 16,
  maxToolCalls: 8,
  enabled: true,
  allowedTools: [],
};

export default function AgentsPage() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [accessAgentId, setAccessAgentId] = useState<string | null>(null);
  const [accessReports, setAccessReports] = useState<Record<string, ToolAccessReport>>({});
  const [accessLoadingId, setAccessLoadingId] = useState<string | null>(null);
  const [accessError, setAccessError] = useState("");

  async function request(path: string, init: RequestInit = {}) {
    return ownerFetch(path, init);
  }

  async function loadAgents() {
    const [response, toolResponse] = await Promise.all([
      request("/api/v1/agents"),
      request("/api/v1/tools"),
    ]);
    const data = await response.json();
    const toolData = await toolResponse.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load agents.");
    if (!toolResponse.ok) throw new Error(toolData.error ?? "Could not load registered tools.");
    setAgents(data.agents ?? []);
    setTools((toolData.tools ?? []).filter((tool: Tool) => tool.id !== "device.dispatch_tool" && !tool.id.startsWith("agent.")));
    setAccessReports({});
    setAccessAgentId(null);
    setAccessError("");
  }

  async function connect() {
    setBusy(true);
    setError("");
    try {
      if (token.length >= 32) await openOwnerSession(token);
      else if (!(await hasOwnerSession())) throw new Error("Open a secure owner session from the main dashboard first.");
      setToken("");
      await loadAgents();
      setConnected(true);
      setMessage("Secure owner session verified. Agent definitions loaded.");
    } catch (cause) {
      setConnected(false);
      setError(cause instanceof Error ? cause.message : "Could not connect.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    void hasOwnerSession().then((authenticated) => {
      if (active && authenticated) void connect();
    });
    return () => { active = false; };
  }, []);

  function beginCreate() {
    setEditingId(null);
    setDraft({ ...emptyDraft, allowedTools: tools.filter((tool) => tool.available && !tool.sideEffect && tool.target !== "device").map((tool) => tool.id) });
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
      allowedTools: agent.allowed_tools ?? [],
    });
    setShowEditor(true);
    setError("");
    setMessage("");
  }

  async function refreshToolAccess(agentId: string) {
    setAccessLoadingId(agentId);
    setAccessError("");
    try {
      const response = await request("/api/v1/agents/" + agentId + "/tools");
      const data = await response.json() as ToolAccessReport & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Tool access could not be loaded.");
      setAccessReports((current) => ({ ...current, [agentId]: data }));
    } catch (cause) {
      setAccessError(cause instanceof Error ? cause.message : "Tool access could not be loaded.");
    } finally {
      setAccessLoadingId((current) => current === agentId ? null : current);
    }
  }

  async function inspectToolAccess(agentId: string) {
    if (accessAgentId === agentId) {
      setAccessAgentId(null);
      setAccessError("");
      return;
    }
    setAccessAgentId(agentId);
    setAccessError("");
    if (!accessReports[agentId]) await refreshToolAccess(agentId);
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
            allowedTools: draft.allowedTools,
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
              placeholder="Enter FS_OWNER_TOKEN once"
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
                    {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-zinc-400">Maximum tool calls
                  <select value={draft.maxToolCalls} onChange={(event) => setDraft({ ...draft, maxToolCalls: Number(event.target.value) })} className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white">
                    {[0,1,2,3,4,5,6,7,8].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>
              <fieldset className="space-y-2 rounded-xl border border-border p-3">
                <legend className="px-1 text-xs text-zinc-400">Allowed tools</legend>
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-zinc-500">Selected tools are the only tools this Agent may call. New Agents start with registered read-only tools; write/device actions always require explicit selection.</p><button type="button" onClick={() => setDraft({ ...draft, allowedTools: tools.filter((tool) => tool.available && !tool.sideEffect && tool.target !== "device").map((tool) => tool.id) })} className="rounded-lg border border-border px-3 py-1.5 text-xs text-cyan-200">Select safe read-only tools</button></div>
                <p className="text-xs font-medium text-cyan-200">{draft.allowedTools.length} of {tools.length} tools selected</p>
                {tools.length === 0 && <p role="status" className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-2 text-xs text-amber-200">No registered tools were returned by the backend. Refresh or check the Tools page before creating this Agent.</p>}
                {tools.length > 0 && draft.allowedTools.length === 0 && <p role="alert" className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-2 text-xs text-amber-200">This Agent is tool-free. Assign at least one tool if it needs to perform tool-based work.</p>}
                <div className="grid gap-2 sm:grid-cols-2">
                  {tools.map((tool) => (
                    <label key={tool.id} className="flex items-start gap-2 rounded-lg border border-border/70 p-2 text-xs text-zinc-300">
                      <input
                        type="checkbox"
                        checked={draft.allowedTools.includes(tool.id)}
                        onChange={(event) => setDraft({
                          ...draft,
                          allowedTools: event.target.checked
                            ? [...draft.allowedTools, tool.id]
                            : draft.allowedTools.filter((id) => id !== tool.id),
                        })}
                        className="mt-0.5 h-4 w-4 accent-cyan-400"
                      />
                      <span className="min-w-0">
                        <span className="block break-all text-cyan-200">{tool.id}</span>
                        <span className="mt-1 block text-zinc-500">{tool.description}</span>
                        <span className="mt-1 block text-[10px] uppercase tracking-wide text-zinc-400">{tool.target === "device" ? "Android device · explicit assignment" : tool.target === "remote_mcp" ? "Remote MCP · connected manifest" : "Backend registry"}</span>
                        <span className={tool.available ? "mt-1 block text-emerald-300" : "mt-1 block text-amber-300"}>{tool.available ? "Available in current registry" : "Unavailable right now"}</span>
                        <span className={tool.sideEffect || tool.target === "device" ? "mt-1 block text-amber-300" : "mt-1 block text-emerald-300"}>{tool.target === "device" ? "Device-side consent required" : tool.sideEffect ? "Can change data · explicit approval may apply" : "Read-only capability"}</span>
                        {tool.availabilityNote && <span className="mt-1 block text-[10px] leading-4 text-zinc-600">{tool.availabilityNote}</span>}
                      </span>
                    </label>
                  ))}
                </div>
                {draft.allowedTools.filter((id) => !tools.some((tool) => tool.id === id)).length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/10 p-3">
                    <p className="text-xs font-semibold text-amber-200">Assignments no longer in the registry</p>
                    <p className="mt-1 text-[10px] leading-5 text-zinc-500">These IDs may belong to a disconnected MCP server or removed device capability. Uncheck to remove them from this Agent.</p>
                    {draft.allowedTools.filter((id) => !tools.some((tool) => tool.id === id)).map((id) => (
                      <label key={id} className="mt-2 flex items-center gap-2 break-all text-xs text-amber-100">
                        <input type="checkbox" checked onChange={() => setDraft({ ...draft, allowedTools: draft.allowedTools.filter((item) => item !== id) })} className="h-4 w-4 accent-amber-400" />
                        {id}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
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
                  <p className="mt-3 text-xs text-zinc-400">{(agent.allowed_tools ?? []).length} tool(s) assigned{(agent.allowed_tools ?? []).length === 0 ? " · tool-free Agent" : ""}</p>
                  <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{agent.instructions}</p>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                    <button type="button" disabled={busy} onClick={() => beginEdit(agent)} className="rounded-lg border border-border px-3 py-2 text-xs text-zinc-300">Edit</button>
                    <button type="button" disabled={busy} onClick={() => void inspectToolAccess(agent.id)} aria-expanded={accessAgentId === agent.id} className="rounded-lg border border-cyan-900/50 px-3 py-2 text-xs text-cyan-200">{accessAgentId === agent.id ? "Hide tool access" : "Inspect tool access"}</button>
                    <button type="button" disabled={busy} onClick={() => void toggleAgent(agent)} className="rounded-lg border border-border px-3 py-2 text-xs text-zinc-300">{agent.enabled ? "Pause" : "Enable"}</button>
                    <button type="button" disabled={busy} onClick={() => void deleteAgent(agent)} className="rounded-lg border border-red-900/50 px-3 py-2 text-xs text-red-300">Delete</button>
                  </div>
                  {accessAgentId === agent.id && (
                    <div className="mt-4 space-y-3 border-t border-border pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div><p className="text-xs font-semibold text-white">Per-Agent tool access</p><p className="mt-1 text-[10px] text-zinc-500">Registry and heartbeat snapshot · not a permission grant</p></div>
                        <button type="button" disabled={accessLoadingId === agent.id} onClick={() => void refreshToolAccess(agent.id)} className="rounded-lg border border-border px-3 py-2 text-[10px] text-zinc-300">{accessLoadingId === agent.id ? "Refreshing…" : "Refresh access"}</button>
                      </div>
                      {accessLoadingId === agent.id && <p role="status" className="text-xs text-zinc-500">Loading backend, Remote MCP and device capabilities…</p>}
                      {accessError && <p role="alert" className="rounded-lg border border-red-900/40 bg-red-950/20 p-3 text-xs text-red-300">{accessError}</p>}
                      {accessReports[agent.id] && (
                        <>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {[
                              ["Allowlisted", accessReports[agent.id].summary.allowlisted],
                              ["Assigned", accessReports[agent.id].summary.assigned],
                              ["Available", accessReports[agent.id].summary.available],
                              ["Denied", accessReports[agent.id].summary.denied],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-lg border border-border bg-black/20 p-2">
                                <p className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</p>
                                <p className="mt-1 text-lg font-semibold text-white">{value}</p>
                              </div>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-wide">
                            {[
                              ["Backend", accessReports[agent.id].sources.backend],
                              ["Remote MCP", accessReports[agent.id].sources.remoteMcp],
                              ["Devices", accessReports[agent.id].sources.devices],
                            ].map(([label, value]) => (
                              <span key={label} className="rounded-md border border-border px-2 py-1 text-zinc-400">{label}: {value}</span>
                            ))}
                          </div>
                          <div className="max-h-[440px] space-y-2 overflow-y-auto pr-1">
                            {accessReports[agent.id].tools.map((tool) => (
                              <div key={tool.id} className="rounded-lg border border-border/80 bg-black/20 p-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <p className="min-w-0 break-all font-mono text-[11px] text-cyan-200">{tool.id}</p>
                                  <span className={tool.assignmentDecision === "allowlisted" ? "rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-bold text-emerald-300" : "rounded-full bg-red-400/10 px-2 py-1 text-[9px] font-bold text-red-300"}>{tool.assignmentDecision === "allowlisted" ? "ALLOWLISTED" : "DENIED"}</span>
                                </div>
                                <p className="mt-1 text-[10px] leading-5 text-zinc-500">{tool.description}</p>
                                <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] uppercase tracking-wide">
                                  <span className="rounded border border-border px-2 py-1 text-zinc-300">{tool.assigned ? "Assigned" : "Not assigned"}</span>
                                  <span className={tool.available ? "rounded border border-emerald-900/50 px-2 py-1 text-emerald-300" : "rounded border border-amber-900/50 px-2 py-1 text-amber-300"}>{tool.available ? "Available" : "Unavailable"}</span>
                                  <span className="rounded border border-border px-2 py-1 text-zinc-400">{tool.target.replace("_", " ")}</span>
                                  <span className="rounded border border-border px-2 py-1 text-zinc-500">{tool.permission}</span>
                                  <span className="rounded border border-border px-2 py-1 text-zinc-500">{tool.risk === "side_effect" ? "Side effect" : "Read only"}</span>
                                </div>
                                {tool.denialReasons.length > 0 && <p className="mt-2 text-[10px] text-red-300">Denied: {tool.denialReasons.map((reason) => reason === "not_assigned" ? "not assigned to this Agent" : "capability unavailable").join(" · ")}</p>}
                                {tool.availabilityNote && <p className="mt-1 text-[10px] leading-5 text-zinc-600">{tool.availabilityNote}</p>}
                                {tool.sideEffect && <p className="mt-1 text-[10px] text-amber-300">A separate approval may still be required before execution.</p>}
                                {tool.target === "device" && <p className="mt-1 text-[10px] text-amber-300">Android OS permissions and user consent are enforced on the device.</p>}
                              </div>
                            ))}
                          </div>
                          {accessReports[agent.id].unavailableAssignments.length > 0 && (
                            <div className="rounded-lg border border-amber-900/40 bg-amber-950/10 p-3">
                              <p className="text-xs font-semibold text-amber-200">Assigned IDs not currently registered</p>
                              <p className="mt-1 break-all text-[10px] leading-5 text-zinc-400">{accessReports[agent.id].unavailableAssignments.join(" · ")}</p>
                            </div>
                          )}
                          <p className="text-[10px] leading-5 text-zinc-500">{accessReports[agent.id].policy}</p>
                          <p className="text-[10px] leading-5 text-zinc-600">{accessReports[agent.id].availabilityPolicy}</p>
                        </>
                      )}
                    </div>
                  )}
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
