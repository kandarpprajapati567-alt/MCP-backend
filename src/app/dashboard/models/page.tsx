"use client";

import { useEffect, useState } from "react";
import { hasOwnerSession, openOwnerSession, ownerFetch } from "@/lib/client/owner-session";
import { PageHeader } from "@/components/ui/PageHeader";

type Workflow = "planner" | "coding" | "research" | "summarization" | "chat" | "notes";
type Policy = {
  workflow: Workflow;
  primary_provider: string;
  primary_model: string;
  fallback_providers: string[];
  fallback_model: string | null;
  required_capabilities: string[];
  enabled: boolean;
  updated_at: string;
};

const workflows: { id: Workflow; label: string; detail: string }[] = [
  { id: "planner", label: "Planner", detail: "Break user requests into structured steps." },
  { id: "coding", label: "Coding", detail: "Code analysis and generation workflows." },
  { id: "research", label: "Research", detail: "Research and information gathering." },
  { id: "summarization", label: "Summarization", detail: "Synthesize tool results and source material." },
  { id: "chat", label: "Chat", detail: "General conversation workflows." },
  { id: "notes", label: "Notes", detail: "Structured notes and study content." },
];

const models: Record<string, string> = {
  mock: "mock-v1",
  openai: "gpt-4o-mini",
  openrouter: "openai/gpt-4o-mini",
};

export default function ModelsPage() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [workflow, setWorkflow] = useState<Workflow>("planner");
  const [primaryProvider, setPrimaryProvider] = useState("mock");
  const [primaryModel, setPrimaryModel] = useState("mock-v1");
  const [fallbackProvider, setFallbackProvider] = useState("none");
  const [fallbackModel, setFallbackModel] = useState("");
  const [enabled, setEnabled] = useState(true);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      if (token.length >= 32) await openOwnerSession(token);
      else if (!(await hasOwnerSession())) throw new Error("Open a secure owner session from the main dashboard first.");
      setToken("");
      const response = await ownerFetch("/api/v1/ai/policies");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Backend access was rejected.");
      const available = data.availableProviders ?? [];
      const savedPolicies = data.policies ?? [];
      setAvailableProviders(available);
      setPolicies(savedPolicies);
      const initial = savedPolicies.find((item: Policy) => item.workflow === workflow);
      if (initial) {
        setPrimaryProvider(initial.primary_provider);
        setPrimaryModel(initial.primary_model);
        setFallbackProvider(initial.fallback_providers[0] ?? "none");
        setFallbackModel(initial.fallback_model ?? "");
        setEnabled(initial.enabled);
      } else {
        const automatic = available.includes("openai") ? "openai" : available.includes("openrouter") ? "openrouter" : "mock";
        setPrimaryProvider(automatic);
        setPrimaryModel(models[automatic] ?? "mock-v1");
        setFallbackProvider(automatic === "openai" && available.includes("openrouter") ? "openrouter" : "none");
        setFallbackModel("");
        setEnabled(true);
      }
      setConnected(true);
      setMessage("AI routing configuration loaded.");
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

  function selectWorkflow(next: Workflow) {
    setWorkflow(next);
    const saved = policies.find((item) => item.workflow === next);
    if (saved) {
      setPrimaryProvider(saved.primary_provider);
      setPrimaryModel(saved.primary_model);
      setFallbackProvider(saved.fallback_providers[0] ?? "none");
      setFallbackModel(saved.fallback_model ?? "");
      setEnabled(saved.enabled);
    } else {
      const automatic = availableProviders.includes("openai") ? "openai" : availableProviders.includes("openrouter") ? "openrouter" : "mock";
      setPrimaryProvider(automatic);
      setPrimaryModel(models[automatic] ?? "mock-v1");
      setFallbackProvider(automatic === "openai" && availableProviders.includes("openrouter") ? "openrouter" : "none");
      setFallbackModel("");
      setEnabled(true);
    }
  }

  function selectPrimary(next: string) {
    setPrimaryProvider(next);
    setPrimaryModel(models[next] ?? "");
    if (fallbackProvider === next) setFallbackProvider("none");
  }

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await ownerFetch("/api/v1/ai/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow,
          primaryProvider,
          primaryModel,
          fallbackProviders: fallbackProvider === "none" ? [] : [fallbackProvider],
          fallbackModel: fallbackModel || null,
          requiredCapabilities: ["text-generation"],
          enabled,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Policy could not be saved.");
      setPolicies((current) => [...current.filter((item) => item.workflow !== workflow), data.policy]);
      setMessage(workflow + " routing policy saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Policy could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError("");
    try {
      const response = await ownerFetch("/api/v1/ai/policies", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow }),
      });
      if (!response.ok) throw new Error("Policy could not be reset.");
      setPolicies((current) => current.filter((item) => item.workflow !== workflow));
      const automatic = availableProviders.includes("openai") ? "openai" : availableProviders.includes("openrouter") ? "openrouter" : "mock";
      setPrimaryProvider(automatic);
      setPrimaryModel(models[automatic] ?? "mock-v1");
      setFallbackProvider(automatic === "openai" && availableProviders.includes("openrouter") ? "openrouter" : "none");
      setFallbackModel("");
      setEnabled(true);
      setMessage("Default automatic routing restored for " + workflow + ".");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Policy could not be reset.");
    } finally {
      setBusy(false);
    }
  }

  const selectedWorkflow = workflows.find((item) => item.id === workflow)!;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="AI Engine & Routing"
        description="Choose which configured provider handles each type of work, with a controlled fallback."
      />
      {!connected ? (
        <section className="rounded-2xl border border-border bg-zinc-950/70 p-5">
          <h2 className="text-base font-semibold text-white">Connect to backend</h2>
          <p className="mt-1 text-sm text-zinc-400">Enter the master token once, or reuse the secure session opened from the main dashboard.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Enter FS_OWNER_TOKEN once" className="min-w-0 flex-1 rounded-xl border border-border bg-black/30 px-4 py-3 text-sm text-white" />
            <button type="button" disabled={busy || token.length < 32} onClick={() => void connect()} className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40">{busy ? "Connecting…" : "Load routing"}</button>
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-zinc-950/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">Provider availability</h2>
                <p className="mt-1 text-xs text-zinc-500">Only configured providers can execute requests. Add keys from the main dashboard.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableProviders.map((item) => <span key={item} className="rounded-full border border-border px-3 py-1 text-xs capitalize text-zinc-300">{item}</span>)}
              </div>
            </div>
          </section>
          <section className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <div className="rounded-2xl border border-border bg-zinc-950/70 p-3">
              <h2 className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Workflow types</h2>
              <div className="space-y-1">
                {workflows.map((item) => (
                  <button key={item.id} type="button" onClick={() => selectWorkflow(item.id)} className={workflow === item.id ? "w-full rounded-xl bg-cyan-400/10 px-3 py-3 text-left text-sm text-cyan-200" : "w-full rounded-xl px-3 py-3 text-left text-sm text-zinc-300 hover:bg-white/5"}>
                    <span className="block font-medium">{item.label}</span>
                    <span className="mt-1 block text-xs text-zinc-500">{item.detail}</span>
                    {policies.some((policy) => policy.workflow === item.id) && <span className="mt-2 block text-[10px] text-emerald-300">Custom policy saved</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-zinc-950/70 p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-white">{selectedWorkflow.label} routing</h2>
              <p className="mt-1 text-sm text-zinc-400">{selectedWorkflow.detail}</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-zinc-300">
                  Primary provider
                  <select value={primaryProvider} onChange={(event) => selectPrimary(event.target.value)} className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white">
                    <option value="mock">Mock (no API cost)</option>
                    <option value="openai">OpenAI</option>
                    <option value="openrouter">OpenRouter</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-zinc-300">
                  Primary model
                  <input value={primaryModel} onChange={(event) => setPrimaryModel(event.target.value)} maxLength={160} className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" />
                </label>
                <label className="space-y-2 text-sm text-zinc-300">
                  Fallback provider
                  <select value={fallbackProvider} onChange={(event) => setFallbackProvider(event.target.value)} className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white">
                    <option value="none">No explicit fallback</option>
                    <option value="mock">Mock</option>
                    <option value="openai" disabled={primaryProvider === "openai"}>OpenAI</option>
                    <option value="openrouter" disabled={primaryProvider === "openrouter"}>OpenRouter</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-zinc-300">
                  Fallback model
                  <input value={fallbackModel} onChange={(event) => setFallbackModel(event.target.value)} maxLength={160} placeholder="Optional" className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" />
                </label>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
                Use this custom policy
              </label>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" disabled={busy || !primaryModel.trim()} onClick={() => void save()} className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40">{busy ? "Saving…" : "Save policy"}</button>
                <button type="button" disabled={busy} onClick={() => void reset()} className="rounded-xl border border-border px-5 py-2.5 text-sm text-zinc-300 disabled:opacity-40">Restore automatic routing</button>
              </div>
            </div>
          </section>
        </>
      )}
      {error && <p role="alert" className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-3 text-sm text-emerald-300">{message}</p>}
    </div>
  );
}
