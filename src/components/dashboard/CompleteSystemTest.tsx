"use client";

import { useState } from "react";

type Status = "passed" | "failed" | "skipped";
type Result = { id: string; label: string; status: Status; detail: string; durationMs?: number };
type Agent = { id: string; name: string; enabled: boolean; allowed_tools?: string[] };
type Tool = { id: string; sideEffect?: boolean; description?: string };

type Props = { token: string };

const READ_ONLY_TESTS: Record<string, { prompt: string; expected: string }> = {
  "text.word_count": { prompt: "Use text.word_count on exactly this text: alpha beta gamma delta. Return the numeric word count.", expected: "text.word_count" },
  "text.text_stats": { prompt: "Use text.text_stats on exactly this text: Futuristic System builds reliable AI agents. Return its character and word counts.", expected: "text.text_stats" },
  "text.extract_keywords": { prompt: "Use text.extract_keywords on: solar energy solar panels wind energy. Return the extracted keywords.", expected: "text.extract_keywords" },
  "github.list_branches": { prompt: "Use github.list_branches to list at most three branches in the configured Futuristic System repository. Report only the branch names returned by the tool.", expected: "github.list_branches" },
  "github.list_commits": { prompt: "Use github.list_commits to read the latest two commits from main in the configured Futuristic System repository. Report only returned commit facts.", expected: "github.list_commits" },
  "github.list_files": { prompt: "Use github.list_files to list up to five files at the repository root on main. Report only paths returned by the tool.", expected: "github.list_files" },
  "github.read_file": { prompt: "Use github.read_file to read package.json from main in the configured repository. Report the package name and Node engine from the tool output.", expected: "github.read_file" },
  "web.search": { prompt: "Use web.search for official Next.js documentation about the App Router. Summarize only returned sources.", expected: "web.search" },
  "device.list": { prompt: "Use device.list to inspect registered devices. Report only the number of devices and their reported online status.", expected: "device.list" },
  "models.list_providers": { prompt: "Use models.list_providers to list available model adapters and their reported capabilities.", expected: "models.list_providers" },
};

export function CompleteSystemTest({ token }: Props) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [summary, setSummary] = useState("");
  const [checkedAt, setCheckedAt] = useState("");

  async function request(path: string, method: "GET" | "POST" = "GET", body?: unknown) {
    return fetch(path, {
      method,
      cache: "no-store",
      headers: {
        "x-fs-owner-token": token,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(12000),
    });
  }

  async function runSafeTest() {
    setRunning(true);
    setResults([]);
    setSummary("");
    const checks: Array<{ id: string; label: string; path: string; validate: (data: any, response: Response) => string | null }> = [
      { id: "health", label: "Website API + database", path: "/api/v1/health", validate: (d, r) => r.ok && d.status === "ok" && d.services?.database === "ok" ? null : `HTTP ${r.status}; status=${d.status ?? "unknown"}; database=${d.services?.database ?? "unknown"}` },
      { id: "render", label: "Render backend", path: "/api/v1/system/health", validate: (d) => d.reachable && d.body?.status === "ok" ? null : d.error ?? `Backend unavailable or degraded (HTTP ${d.httpStatus ?? "unknown"}).` },
      { id: "tools", label: "Registered tool catalog", path: "/api/v1/tools", validate: (d, r) => r.ok && Array.isArray(d.tools) && d.tools.length > 0 ? null : d.error ?? "Tool catalog missing or empty." },
      { id: "agents", label: "Agent definitions + tool assignments", path: "/api/v1/agents", validate: (d, r) => r.ok && Array.isArray(d.agents) ? null : d.error ?? "Agent definitions could not be loaded." },
      { id: "providers", label: "Provider adapters + configuration", path: "/api/v1/ai/providers/health", validate: (d, r) => r.ok && Array.isArray(d.providers) ? null : d.error ?? "Provider diagnostics unavailable." },
      { id: "connections", label: "GitHub / Web / remote MCP connections", path: "/api/v1/connections", validate: (d, r) => r.ok && Array.isArray(d.connections) ? null : d.error ?? "Connections registry unavailable." },
      { id: "devices", label: "Android device registry", path: "/api/v1/devices", validate: (d, r) => r.ok && Array.isArray(d.devices) ? null : d.error ?? "Device registry unavailable." },
      { id: "history", label: "Agent task history + persistence read", path: "/api/v1/agent/tasks", validate: (d, r) => r.ok && Array.isArray(d.tasks) ? null : d.error ?? "Task history could not be read." },
    ];

    const output: Result[] = [];
    await Promise.all(checks.map(async (check) => {
      const started = performance.now();
      try {
        const response = await request(check.path);
        const data = await response.json().catch(() => ({}));
        const failure = check.validate(data, response);
        output.push({ id: check.id, label: check.label, status: failure ? "failed" : "passed", detail: failure ?? "Endpoint responded and its expected data contract was verified.", durationMs: Math.round(performance.now() - started) });
      } catch (cause) {
        output.push({ id: check.id, label: check.label, status: "failed", detail: cause instanceof Error ? cause.message : "Request failed.", durationMs: Math.round(performance.now() - started) });
      }
    }));
    output.sort((a, b) => checks.findIndex((c) => c.id === a.id) - checks.findIndex((c) => c.id === b.id));
    setResults(output);
    setSummary(`Safe system test: ${output.filter((r) => r.status === "passed").length} passed · ${output.filter((r) => r.status === "failed").length} failed · 0 skipped`);
    setCheckedAt(new Date().toLocaleString());
    setRunning(false);
  }

  async function runLiveTest() {
    const confirmed = window.confirm(
      "LIVE TEST WARNING\n\nThis runs a real task for each eligible enabled Agent. It may use OpenAI/OpenRouter or connected integration credits and creates task-history records. Only Agents whose entire assigned tool list is marked read-only are eligible. Agents with side-effect tools are skipped. Continue?"
    );
    if (!confirmed) return;

    setRunning(true);
    setResults([]);
    setSummary("");
    const output: Result[] = [];
    try {
      const [agentResponse, toolResponse] = await Promise.all([
        request("/api/v1/agents"),
        request("/api/v1/tools"),
      ]);
      const [agentData, toolData] = await Promise.all([
        agentResponse.json().catch(() => ({})),
        toolResponse.json().catch(() => ({})),
      ]);
      if (!agentResponse.ok || !toolResponse.ok) {
        throw new Error(agentData.error ?? toolData.error ?? "Could not load Agents and tool catalog.");
      }

      const tools = (toolData.tools ?? []) as Tool[];
      const agents = ((agentData.agents ?? []) as Agent[]).filter((agent) => agent.enabled);
      if (!agents.length) {
        output.push({ id: "live-agents", label: "Enabled Agent live execution", status: "skipped", detail: "No enabled Agent definitions are configured." });
      }

      for (const agent of agents) {
        const started = performance.now();
        const assignedIds = agent.allowed_tools ?? [];
        const assignedTools = assignedIds.map((id) => tools.find((tool) => tool.id === id)).filter(Boolean) as Tool[];
        if (!assignedTools.length) {
          output.push({ id: agent.id, label: agent.name, status: "skipped", detail: "No currently registered assigned tools; live execution was not attempted." });
          continue;
        }
        if (assignedTools.length !== assignedIds.length || assignedTools.some((tool) => tool.sideEffect !== false)) {
          output.push({ id: agent.id, label: agent.name, status: "skipped", detail: "This Agent has an unknown or side-effect-capable assigned tool. It was excluded from automated live execution." });
          continue;
        }
        const test = assignedTools.map((tool) => READ_ONLY_TESTS[tool.id]).find(Boolean);
        if (!test) {
          output.push({ id: agent.id, label: agent.name, status: "skipped", detail: "No privacy-safe, deterministic live test is defined for its read-only tools." });
          continue;
        }

        try {
          const response = await request("/api/v1/agent/tasks", "POST", {
            agentId: agent.id,
            task: test.prompt,
          });
          const data = await response.json().catch(() => ({}));
          const toolResults = Array.isArray(data.toolResults) ? data.toolResults : [];
          const observed = toolResults.find((item: { toolId?: string }) => item.toolId === test.expected);
          const passed = response.ok && data.status === "completed" && Boolean(observed);
          output.push({
            id: agent.id,
            label: agent.name,
            status: passed ? "passed" : "failed",
            detail: passed ? `Real Agent pipeline completed and ${test.expected} returned a tool result. Task ID: ${data.taskId ?? "recorded"}.` : data.error ?? (toolResults.length ? "Agent completed without the expected tool result." : "No verified tool execution was returned. Inspect Agent task history for its trace."),
            durationMs: Math.round(performance.now() - started),
          });
        } catch (cause) {
          output.push({ id: agent.id, label: agent.name, status: "failed", detail: cause instanceof Error ? cause.message : "Live Agent request failed.", durationMs: Math.round(performance.now() - started) });
        }
      }
    } catch (cause) {
      output.push({ id: "live-setup", label: "Live test setup", status: "failed", detail: cause instanceof Error ? cause.message : "Could not start live tests." });
    }

    setResults(output);
    setSummary(`Live Agent test: ${output.filter((r) => r.status === "passed").length} passed · ${output.filter((r) => r.status === "failed").length} failed · ${output.filter((r) => r.status === "skipped").length} skipped`);
    setCheckedAt(new Date().toLocaleString());
    setRunning(false);
  }

  const passed = results.filter((item) => item.status === "passed").length;
  const failed = results.filter((item) => item.status === "failed").length;
  const skipped = results.filter((item) => item.status === "skipped").length;

  return (
    <section className="rounded-2xl border border-violet-900/50 bg-gradient-to-br from-violet-950/40 via-zinc-950/90 to-cyan-950/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">End-to-end diagnostics</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Complete System Test</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">Test backend, database, tools, Agent configuration, providers, connections, devices and task-history access from one place.</p>
        </div>
        <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">Owner connected</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={running} onClick={() => void runSafeTest()} className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40">{running ? "Testing…" : "Run Safe Test"}</button>
        <button type="button" disabled={running} onClick={() => void runLiveTest()} className="rounded-xl border border-amber-700/70 bg-amber-950/30 px-5 py-3 text-sm font-semibold text-amber-200 disabled:opacity-40">{running ? "Testing…" : "Run Live Agent Test"}</button>
      </div>
      <p className="mt-3 text-xs text-zinc-500">Safe Test performs read-only endpoint and data-contract checks; it does not run paid AI requests or change records. Live Agent Test asks for confirmation, may consume provider credits and creates task-history records. Agents with side-effect-capable tools are skipped.</p>
      {results.length > 0 && (
        <div className="mt-5">
          <div className="flex flex-wrap justify-between gap-2 border-b border-white/10 pb-3">
            <p className="text-sm font-medium text-white">{summary}</p>
            <p className="text-xs text-zinc-500">Checked {checkedAt}</p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {results.map((item) => (
              <article key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{item.label}</p>
                  <p className="mt-1 break-words text-xs text-zinc-400">{item.detail}</p>
                  {item.durationMs !== undefined && <p className="mt-1 text-[10px] text-zinc-600">{item.durationMs} ms</p>}
                </div>
                <span className={item.status === "passed" ? "shrink-0 rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-300" : item.status === "failed" ? "shrink-0 rounded-full bg-red-400/10 px-2 py-1 text-[10px] font-semibold text-red-300" : "shrink-0 rounded-full bg-zinc-700/40 px-2 py-1 text-[10px] font-semibold text-zinc-300"}>{item.status.toUpperCase()}</span>
              </article>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-zinc-500">Result totals: {passed} passed · {failed} failed · {skipped} skipped. A PASS confirms only the exact check shown; it is not a guarantee that every possible task or integration workflow is bug-free.</p>
        </div>
      )}
    </section>
  );
}
