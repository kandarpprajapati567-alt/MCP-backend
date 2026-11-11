"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

type Agent = { id: string; name: string; role: string; enabled: boolean; allowed_tools: string[] };
type Tool = { id: string; description: string; sideEffect: boolean };
type Bot = {
  id: string; name: string; description: string; persona_instructions: string;
  agent_ids: string[]; default_agent_id: string | null; provider_preference: string;
  model_preference: string | null; allowed_tools: string[]; enabled: boolean;
};
type ChatMessage = { role: "user" | "assistant"; content: string; created_at?: string };
type BotConversation = { id: string; status: string; updated_at: string; last_agent_id: string | null };

const emptyDraft = {
  name: "", description: "", personaInstructions: "",
  agentIds: [] as string[], defaultAgentId: "",
  providerPreference: "auto", modelPreference: "", allowedTools: [] as string[],
};

export default function BotsPage() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [selectedBotId, setSelectedBotId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<BotConversation[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedBot = useMemo(() => bots.find((bot) => bot.id === selectedBotId) ?? null, [bots, selectedBotId]);
  const assignedAgents = useMemo(() => agents.filter((agent) => selectedBot?.agent_ids.includes(agent.id)), [agents, selectedBot]);

  async function request(path: string, init: RequestInit = {}) {
    return fetch(path, {
      ...init, cache: "no-store",
      headers: { "x-fs-owner-token": token, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
    });
  }

  async function loadAll() {
    const [agentResponse, botResponse, toolResponse] = await Promise.all([
      request("/api/v1/agents"), request("/api/v1/bots"), request("/api/v1/tools"),
    ]);
    const [agentData, botData, toolData] = await Promise.all([agentResponse.json(), botResponse.json(), toolResponse.json()]);
    if (!agentResponse.ok) throw new Error(agentData.error ?? "Could not load Agents.");
    if (!botResponse.ok) throw new Error(botData.error ?? "Could not load Bots. Apply the Bot System migration first.");
    if (!toolResponse.ok) throw new Error(toolData.error ?? "Could not load tools.");
    const nextAgents = (agentData.agents ?? []) as Agent[];
    const nextBots = (botData.bots ?? []) as Bot[];
    setAgents(nextAgents);
    setBots(nextBots);
    setTools((toolData.tools ?? []).filter((tool: Tool) => !tool.id.startsWith("device.") && !tool.id.startsWith("agent.")));
    if (!selectedBotId && nextBots.length) setSelectedBotId(nextBots[0].id);
  }

  async function connect() {
    setBusy(true); setError(""); setNotice("");
    try {
      await loadAll();
      setConnected(true);
      setNotice("Owner access verified. Bot and Agent catalogues loaded.");
    } catch (cause) {
      setConnected(false);
      setError(cause instanceof Error ? cause.message : "Could not connect.");
    } finally { setBusy(false); }
  }

  function startCreate() {
    setEditingId(null);
    setDraft(emptyDraft);
    setShowEditor(true);
    setError("");
  }

  function startEdit(bot: Bot) {
    setEditingId(bot.id);
    setDraft({
      name: bot.name, description: bot.description, personaInstructions: bot.persona_instructions,
      agentIds: bot.agent_ids ?? [], defaultAgentId: bot.default_agent_id ?? "",
      providerPreference: bot.provider_preference, modelPreference: bot.model_preference ?? "",
      allowedTools: bot.allowed_tools ?? [],
    });
    setShowEditor(true);
    setError("");
  }

  async function saveBot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await request(editingId ? "/api/v1/bots/" + editingId : "/api/v1/bots", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({
          ...draft,
          defaultAgentId: draft.defaultAgentId || null,
          modelPreference: draft.modelPreference.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Bot could not be saved.");
      await loadAll();
      setSelectedBotId(data.bot.id);
      setShowEditor(false);
      setNotice(editingId ? "Bot updated." : "Bot created.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Bot could not be saved."); }
    finally { setBusy(false); }
  }

  async function toggleBot(bot: Bot) {
    setBusy(true); setError("");
    try {
      const response = await request("/api/v1/bots/" + bot.id, { method: "PATCH", body: JSON.stringify({ enabled: !bot.enabled }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Bot status could not be changed.");
      await loadAll();
      setNotice(bot.name + (bot.enabled ? " paused." : " enabled."));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Bot status could not be changed."); }
    finally { setBusy(false); }
  }

  async function deleteBot(bot: Bot) {
    if (!window.confirm("Delete Bot '" + bot.name + "' and its conversation history?")) return;
    setBusy(true); setError("");
    try {
      const response = await request("/api/v1/bots/" + bot.id, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Bot could not be deleted.");
      setConversationId(null); setMessages([]);
      await loadAll();
      setSelectedBotId((current) => current === bot.id ? "" : current);
      setNotice(bot.name + " deleted.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Bot could not be deleted."); }
    finally { setBusy(false); }
  }

  async function loadConversations(botId: string) {
    const response = await request("/api/v1/bots/" + botId + "/conversations");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Conversation history could not be loaded.");
    setConversations(data.conversations ?? []);
  }

  async function openConversation(botId: string, id: string) {
    const response = await request("/api/v1/bots/" + botId + "/messages?conversationId=" + encodeURIComponent(id));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Conversation could not be loaded.");
    setConversationId(id);
    setMessages((data.messages ?? []).filter((item: ChatMessage) => item.role === "user" || item.role === "assistant"));
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBot || !prompt.trim()) return;
    setBusy(true); setError(""); setNotice("");
    const userText = prompt.trim();
    setMessages((current) => [...current, { role: "user", content: userText }]);
    setPrompt("");
    try {
      const response = await request("/api/v1/bots/" + selectedBot.id + "/messages", {
        method: "POST",
        body: JSON.stringify({ content: userText, ...(conversationId ? { conversationId } : {}), ...(selectedAgentId ? { agentId: selectedAgentId } : {}) }),
      });
      const data = await response.json();
      if (!response.ok && !data.message) throw new Error(data.error ?? "Bot could not process the message.");
      setConversationId(data.conversationId);
      if (data.message) setMessages((current) => [...current, { role: "assistant", content: data.message.content, created_at: data.message.created_at }]);
      if (data.task?.status === "failed") setError("Agent task failed. Open the Agent Manager task history for diagnostics.");
      else if (data.task?.status === "waiting_for_device") setNotice("The Agent task is waiting for a connected device.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bot could not process the message.");
    } finally { setBusy(false); }
  }

  function chooseBot(id: string) {
    setSelectedBotId(id);
    setSelectedAgentId("");
    setConversationId(null);
    setMessages([]);
    setError("");
  }

  return (
    <div className="dashboard-page mx-auto max-w-6xl space-y-6">
      <PageHeader title="Bot Manager" description="Create user-facing assistants, assign specialist Agents, set persona and permissions, and test real delegated conversations." />
      {!connected ? (
        <section className="rounded-2xl border border-border bg-zinc-950/70 p-5">
          <p className="text-sm text-zinc-300">Connect with your owner token to manage Bots.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="FS_OWNER_TOKEN" aria-label="Owner master token" className="min-w-0 flex-1 rounded-xl border border-border bg-black/30 px-4 py-3 text-sm text-white" />
            <button type="button" disabled={busy || token.length < 32} onClick={() => void connect()} className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40">{busy ? "Connecting…" : "Connect Bot Manager"}</button>
          </div>
        </section>
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-zinc-950/70 p-4">
            <div><p className="text-sm font-semibold text-white">Bot workspace connected</p><p className="mt-1 text-xs text-zinc-500">{bots.length} saved Bots · {agents.filter((agent) => agent.enabled).length} enabled Agents available</p></div>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void loadAll().catch((cause) => setError(cause instanceof Error ? cause.message : "Refresh failed."))} className="rounded-xl border border-border px-3 py-2 text-xs text-zinc-300">Refresh</button>
              <button type="button" onClick={startCreate} className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-semibold text-zinc-950">+ Create Bot</button>
            </div>
          </section>

          {showEditor && (
            <form onSubmit={saveBot} className="space-y-4 rounded-2xl border border-cyan-900/50 bg-zinc-950/80 p-5">
              <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-white">{editingId ? "Edit Bot" : "Create a new Bot"}</h2><button type="button" onClick={() => setShowEditor(false)} className="text-xs text-zinc-400">Close</button></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-zinc-400">Bot name<input required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nova Assistant" className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" /></label>
                <label className="space-y-1 text-xs text-zinc-400">Short description<input maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Your everyday task assistant" className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" /></label>
              </div>
              <label className="block space-y-1 text-xs text-zinc-400">Persona and system instructions<textarea required minLength={1} maxLength={12000} rows={4} value={draft.personaInstructions} onChange={(event) => setDraft({ ...draft, personaInstructions: event.target.value })} placeholder="Define the Bot's name, tone, communication style, boundaries and how it should delegate work…" className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" /></label>
              <fieldset className="space-y-2 rounded-xl border border-border p-3">
                <legend className="px-1 text-xs text-zinc-400">Assigned specialist Agents</legend>
                {agents.filter((agent) => agent.enabled).length === 0 ? <p className="text-xs text-amber-300">Create and enable at least one Agent in Agent Manager first.</p> : agents.filter((agent) => agent.enabled).map((agent) => (
                  <label key={agent.id} className="flex items-center gap-2 rounded-lg border border-border/70 p-2 text-xs text-zinc-300">
                    <input type="checkbox" checked={draft.agentIds.includes(agent.id)} onChange={(event) => setDraft({ ...draft, agentIds: event.target.checked ? [...draft.agentIds, agent.id] : draft.agentIds.filter((id) => id !== agent.id), defaultAgentId: event.target.checked ? draft.defaultAgentId : draft.defaultAgentId === agent.id ? "" : draft.defaultAgentId })} className="h-4 w-4 accent-cyan-400" />
                    <span><span className="block text-cyan-200">{agent.name}</span><span className="text-zinc-500">{agent.role}</span></span>
                  </label>
                ))}
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-zinc-400">Default Agent (optional)<select value={draft.defaultAgentId} onChange={(event) => setDraft({ ...draft, defaultAgentId: event.target.value })} className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white"><option value="">Ask user to choose when multiple</option>{agents.filter((agent) => draft.agentIds.includes(agent.id)).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
                <label className="space-y-1 text-xs text-zinc-400">Default AI provider<select value={draft.providerPreference} onChange={(event) => setDraft({ ...draft, providerPreference: event.target.value })} className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white"><option value="auto">Automatic routing</option><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option><option value="mock">Local / mock fallback</option></select></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-zinc-400">Preferred model (optional)<input maxLength={160} value={draft.modelPreference} onChange={(event) => setDraft({ ...draft, modelPreference: event.target.value })} placeholder="e.g. gpt-4o-mini" className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white" /></label>
                <div className="space-y-1 text-xs text-zinc-400">Tool permissions<p className="rounded-xl border border-border bg-black/20 p-3 text-zinc-500">Leave empty to inherit each assigned Agent's allowlist. Selected tools can only narrow Agent permissions, never grant additional access.</p></div>
              </div>
              <fieldset className="space-y-2 rounded-xl border border-border p-3"><legend className="px-1 text-xs text-zinc-400">Bot tool allowlist (optional)</legend><div className="grid gap-2 sm:grid-cols-2">{tools.map((tool) => <label key={tool.id} className="flex items-start gap-2 text-xs text-zinc-300"><input type="checkbox" checked={draft.allowedTools.includes(tool.id)} onChange={(event) => setDraft({ ...draft, allowedTools: event.target.checked ? [...draft.allowedTools, tool.id] : draft.allowedTools.filter((id) => id !== tool.id) })} className="mt-0.5 h-4 w-4 accent-cyan-400" /><span>{tool.id}<span className="block text-zinc-500">{tool.description}</span></span></label>)}</div></fieldset>
              <div className="flex flex-wrap gap-2"><button disabled={busy || !draft.agentIds.length} className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40">{busy ? "Saving…" : editingId ? "Save changes" : "Create Bot"}</button><button type="button" disabled={busy} onClick={() => setShowEditor(false)} className="rounded-xl border border-border px-4 py-2.5 text-sm text-zinc-300">Cancel</button></div>
            </form>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.5fr)]">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-200">Your Bots</h2>
              {bots.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-6 text-center"><p className="text-sm text-zinc-300">No Bots yet</p><p className="mt-2 text-xs text-zinc-500">Create a Bot and assign one or more specialist Agents.</p></div> : bots.map((bot) => (
                <article key={bot.id} className={bot.id === selectedBotId ? "rounded-2xl border border-cyan-500/50 bg-cyan-950/20 p-4" : "rounded-2xl border border-border bg-zinc-950/70 p-4"}>
                  <button type="button" onClick={() => chooseBot(bot.id)} className="w-full text-left"><div className="flex items-start justify-between gap-2"><span className="font-semibold text-white">{bot.name}</span><span className={bot.enabled ? "text-[10px] text-emerald-300" : "text-[10px] text-zinc-500"}>{bot.enabled ? "Active" : "Paused"}</span></div><p className="mt-2 text-xs text-zinc-400">{bot.description || "No description"}</p><p className="mt-3 text-[10px] text-zinc-500">{bot.agent_ids.length} assigned Agent(s) · {bot.provider_preference}</p></button>
                  <div className="mt-3 flex gap-2 border-t border-border pt-3"><button type="button" disabled={busy} onClick={() => startEdit(bot)} className="text-xs text-zinc-300">Edit</button><button type="button" disabled={busy} onClick={() => void toggleBot(bot)} className="text-xs text-zinc-300">{bot.enabled ? "Pause" : "Enable"}</button><button type="button" disabled={busy} onClick={() => void deleteBot(bot)} className="text-xs text-red-300">Delete</button></div>
                </article>
              ))}
            </section>

            <section className="flex min-h-[480px] flex-col rounded-2xl border border-border bg-zinc-950/70 p-4 sm:p-5">
              {selectedBot ? <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4"><div><p className="text-xs uppercase tracking-wider text-cyan-300">Bot conversation</p><h2 className="mt-1 text-lg font-semibold text-white">{selectedBot.name}</h2><p className="mt-1 text-xs text-zinc-500">{selectedBot.description}</p></div><div className="flex items-center gap-2"><select value={conversationId ?? ""} onChange={(event) => { if (event.target.value) void openConversation(selectedBot.id, event.target.value).catch((cause) => setError(cause instanceof Error ? cause.message : "Conversation load failed.")); }} className="max-w-[180px] rounded-lg border border-border bg-black/30 px-2 py-1.5 text-xs text-zinc-300"><option value="">New conversation</option>{conversations.map((item) => <option key={item.id} value={item.id}>{new Date(item.updated_at).toLocaleString()}</option>)}</select><button type="button" onClick={() => { setConversationId(null); setMessages([]); }} className="text-xs text-cyan-300">New chat</button></div></div>
                <label className="mt-4 space-y-1 text-xs text-zinc-400">Delegate to Agent<select value={selectedAgentId || selectedBot.default_agent_id || (assignedAgents.length === 1 ? assignedAgents[0]?.id ?? "" : "")} onChange={(event) => setSelectedAgentId(event.target.value)} className="w-full rounded-xl border border-border bg-black/30 px-3 py-2.5 text-sm text-white"><option value="">Choose assigned Agent…</option>{assignedAgents.map((agent) => <option key={agent.id} value={agent.id} disabled={!agent.enabled}>{agent.name}{agent.enabled ? "" : " (disabled)"}</option>)}</select></label>
                <div className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-xl border border-border/70 bg-black/20 p-3">
                  {messages.length === 0 ? <div className="py-12 text-center"><p className="text-sm text-zinc-300">Start a conversation</p><p className="mt-2 text-xs text-zinc-500">The Bot will delegate your request to an assigned Agent and return its result.</p></div> : messages.map((item, index) => <div key={index} className={item.role === "user" ? "ml-6 rounded-xl bg-cyan-950/40 p-3 text-sm text-cyan-100" : "mr-6 rounded-xl border border-border bg-zinc-900 p-3 text-sm text-zinc-200"}><p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">{item.role === "user" ? "You" : selectedBot.name}</p><p className="whitespace-pre-wrap break-words">{item.content}</p></div>)}
                </div>
                <form onSubmit={sendMessage} className="mt-4 space-y-2"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} maxLength={4000} disabled={!selectedBot.enabled || busy} placeholder={selectedBot.enabled ? "Tell your Bot what you need…" : "This Bot is paused."} className="w-full rounded-xl border border-border bg-black/30 px-3 py-3 text-sm text-white placeholder:text-zinc-600 disabled:opacity-50" /><div className="flex items-center justify-between gap-2"><span className="text-[10px] text-zinc-500">Execution and messages are saved in the backend.</span><button disabled={busy || !prompt.trim() || !selectedBot.enabled} className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40">{busy ? "Working…" : "Send message"}</button></div></form>
              </> : <div className="m-auto text-center"><p className="text-sm text-zinc-300">Select a Bot to test it</p><p className="mt-2 text-xs text-zinc-500">Your Bot conversations use the existing Agent execution pipeline.</p></div>}
            </section>
          </div>
        </>
      )}
      {error && <p role="alert" className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-3 text-sm text-emerald-300">{notice}</p>}
    </div>
  );
}
