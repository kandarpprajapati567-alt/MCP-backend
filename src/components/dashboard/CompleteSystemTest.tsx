"use client";

import { useState } from "react";
import { selectZeroCostLiveTest } from "@/lib/agent-system-test-policy";

type Status = "passed" | "failed" | "skipped";
type Result = { id: string; label: string; status: Status; detail: string; durationMs?: number };
type Agent = { id: string; name: string; enabled: boolean; provider_preference?: string; allowed_tools?: string[] };
type Tool = { id: string; sideEffect?: boolean; description?: string };

type Props = { onUnauthorized: () => void };

export function CompleteSystemTest({ onUnauthorized }: Props) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [summary, setSummary] = useState("");
  const [checkedAt, setCheckedAt] = useState("");

  async function request(path: string, method: "GET" | "POST" = "GET", body?: unknown) {
    const response = await fetch(path, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 401) onUnauthorized();
    return response;
  }

  async function runSafeTest() {
    setRunning(true);
    setResults([]);
    setSummary("");
    const checks: Array<{ id: string; label: string; path: string; validate: (data: any, response: Response) => string | null }> = [
      { id: "health", label: "Website API + database", path: "/api/v1/health", validate: (d, r) => r.ok && d.status === "ok" && d.services?.database === "ok" ? null : `HTTP ${r.status}; status=${d.status ?? "unknown"}; database=${d.services?.database ?? "unknown"}` },
      { id: "render", label: "Render backend", path: "/api/v1/system/health", validate: (d) => d.reachable && d.body?.status === "ok" ? null : d.error ?? `Backend unavailable or degraded (HTTP ${d.httpStatus ?? "unknown"}).` },
      { id: "tools", label: "Unified backend / MCP / device tool catalog", path: "/api/v1/tools", validate: (d, r) => r.ok && Array.isArray(d.tools) && d.tools.length > 0 && d.tools.every((tool: any) => typeof tool.id === "string") ? null : d.error ?? "Tool catalog missing or malformed." },
      { id: "agents", label: "Agent definitions registry", path: "/api/v1/agents", validate: (d, r) => r.ok && Array.isArray(d.agents) ? null : d.error ?? "Agent definitions could not be loaded." },
      { id: "providers", label: "Provider configuration (passive)", path: "/api/v1/ai/providers/health", validate: (d, r) => r.ok && Array.isArray(d.providers) && d.billingImpact === "none" && d.vendorConnectivityTested === false ? null : d.error ?? "Provider diagnostics are unavailable or attempted a non-passive check." },
      { id: "connections", label: "GitHub / Web / Remote MCP connections", path: "/api/v1/connections", validate: (d, r) => {
        const remote = Array.isArray(d.connections) ? d.connections.find((item: any) => item.id === "mcp_remote") : null;
        return r.ok && Array.isArray(d.connections) && remote && typeof remote.status === "string"
          ? null
          : d.error ?? "Connections registry or Remote MCP status is unavailable.";
      } },
      { id: "mcp-discovery", label: "Remote MCP discovery registry", path: "/api/v1/connections/remote-mcp", validate: (d, r) => r.ok && Array.isArray(d.servers) ? null : d.error ?? "Remote MCP server registry is unavailable." },
      { id: "mcp-audit", label: "Remote MCP audit history", path: "/api/v1/connections/remote-mcp/audit?limit=5", validate: (d, r) => r.ok && Array.isArray(d.events) ? null : d.error ?? "Remote MCP audit history is unavailable." },
      { id: "devices", label: "Android device registry", path: "/api/v1/devices", validate: (d, r) => r.ok && Array.isArray(d.devices) ? null : d.error ?? "Device registry unavailable." },
      { id: "history", label: "Agent task history + persistence read", path: "/api/v1/agent/tasks", validate: (d, r) => r.ok && Array.isArray(d.tasks) && d.tasks.every((task: any) => typeof task.id === "string" && typeof task.status === "string") ? null : d.error ?? "Task history could not be read or has an invalid shape." },
    ];

    const output: Result[] = [];
    let agentDefinitions: Agent[] = [];
    await Promise.all(checks.map(async (check) => {
      const started = performance.now();
      try {
        const response = await request(check.path);
        const data = await response.json().catch(() => ({}));
        if (check.id === "agents" && Array.isArray(data.agents)) agentDefinitions = data.agents as Agent[];
        const migrationSkip =
          (check.id === "mcp-discovery" && response.status === 503 && /Apply the Remote MCP migration/i.test(String(data.error ?? ""))) ||
          (check.id === "mcp-audit" && response.status === 503 && /Apply the Remote MCP audit migration/i.test(String(data.error ?? "")));
        const failure = check.validate(data, response);
        output.push({
          id: check.id,
          label: check.label,
          status: migrationSkip ? "skipped" : failure ? "failed" : "passed",
          detail: migrationSkip
            ? "The optional Remote MCP database migration is not applied. No migration or write was attempted by this diagnostic."
            : failure ?? "Read-only endpoint responded and its expected data contract was verified.",
          durationMs: Math.round(performance.now() - started),
        });
      } catch (cause) {
        output.push({ id: check.id, label: check.label, status: "failed", detail: cause instanceof Error ? cause.message : "Request failed.", durationMs: Math.round(performance.now() - started) });
      }
    }));

    const accessTargets = agentDefinitions.slice(0, 12);
    if (accessTargets.length === 0) {
      output.push({ id: "agent-access-none", label: "Per-Agent permissions and tool access", status: "skipped", detail: "No Agent definitions were returned to inspect." });
    }
    await Promise.all(accessTargets.map(async (agent) => {
      const started = performance.now();
      try {
        const response = await request("/api/v1/agents/" + encodeURIComponent(agent.id) + "/tools");
        const data = await response.json().catch(() => ({}));
        const summary = data.summary && typeof data.summary === "object" ? data.summary as Record<string, unknown> : null;
        const summaryValid = Boolean(summary) && ["total", "assigned", "available", "allowlisted", "denied"].every((key) =>
          typeof summary?.[key] === "number" && Number.isInteger(summary[key]),
        );
        const toolsValid = Array.isArray(data.tools) && data.tools.every((tool: any) =>
          typeof tool.id === "string" &&
          typeof tool.assigned === "boolean" &&
          typeof tool.available === "boolean" &&
          (tool.assignmentDecision === "allowlisted" || tool.assignmentDecision === "denied") &&
          typeof tool.permission === "string" &&
          typeof tool.sideEffect === "boolean",
        );
        const policyValid = typeof data.policy === "string" && /allowlist assignment is not a permission grant/i.test(data.policy);
        const passed = response.ok && data.agentId === agent.id && summaryValid && toolsValid && policyValid;
        output.push({
          id: "agent-access-" + agent.id,
          label: agent.name + " · permission boundary",
          status: passed ? "passed" : "failed",
          detail: passed
            ? `${summary?.assigned} assigned · ${summary?.available} available · ${summary?.denied} denied. Assignment is not an execution permission grant.`
            : data.error ?? "Per-Agent access report or permission boundary is malformed.",
          durationMs: Math.round(performance.now() - started),
        });
      } catch (cause) {
        output.push({ id: "agent-access-" + agent.id, label: agent.name + " · permission boundary", status: "failed", detail: cause instanceof Error ? cause.message : "Access report request failed.", durationMs: Math.round(performance.now() - started) });
      }
    }));
    if (agentDefinitions.length > accessTargets.length) {
      output.push({
        id: "agent-access-cap",
        label: "Additional Agent access reports",
        status: "skipped",
        detail: `Checked the first ${accessTargets.length} of ${agentDefinitions.length} Agent definitions to keep Safe Test bounded.`,
      });
    }

    const checkOrder = new Map(checks.map((check, index) => [check.id, index]));
    output.sort((a, b) =>
      (checkOrder.get(a.id) ?? checks.length) - (checkOrder.get(b.id) ?? checks.length) ||
      a.label.localeCompare(b.label),
    );
    setResults(output);
    setSummary(`Safe system test: ${output.filter((r) => r.status === "passed").length} passed · ${output.filter((r) => r.status === "failed").length} failed · ${output.filter((r) => r.status === "skipped").length} skipped`);
    setCheckedAt(new Date().toLocaleString());
    setRunning(false);
  }

  async function runLiveTest() {
    const confirmed = window.confirm(
      "LIVE TEST WARNING\n\nThis creates task-history records for at most three eligible Agents. It uses only the Mock provider and assigned local text tools. It will not call OpenAI, OpenRouter, Web Search, GitHub, Remote MCP or Android devices. Agents outside this strict zero-cost policy are skipped. Continue?"
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

      let executed = 0;
      for (const agent of agents) {
        const started = performance.now();
        const decision = selectZeroCostLiveTest(agent, tools);
        if (!decision.eligible) {
          output.push({ id: agent.id, label: agent.name, status: "skipped", detail: decision.reason });
          continue;
        }
        if (executed >= 3) {
          output.push({ id: agent.id, label: agent.name, status: "skipped", detail: "The zero-cost Live test limit is three Agent tasks per run." });
          continue;
        }
        executed += 1;
        const test = decision.test;

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
            detail: passed ? `Mock-backed local pipeline completed and ${test.expected} returned a tool result. Task ID: ${data.taskId ?? "recorded"}.` : data.error ?? (toolResults.length ? "Agent completed without the expected local tool result." : "No verified local tool execution was returned. Inspect Agent task history for its trace."),
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
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">Inspect API and database health, providers, unified tools, per-Agent assignments and permission boundaries, Remote MCP discovery/audit readiness, Android devices and task history.</p>
        </div>
        <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">Owner connected</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={running} onClick={() => void runSafeTest()} className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40">{running ? "Testing…" : "Run Safe Test"}</button>
        <button type="button" disabled={running} onClick={() => void runLiveTest()} className="rounded-xl border border-amber-700/70 bg-amber-950/30 px-5 py-3 text-sm font-semibold text-amber-200 disabled:opacity-40">{running ? "Testing…" : "Run zero-cost Live Test"}</button>
      </div>
      <p className="mt-3 text-xs text-zinc-500">Safe Test is the default diagnostic path and uses read-only GET requests only. Missing optional MCP migrations are reported as SKIPPED; no migration is applied. The separately confirmed Live Test creates task-history records but is capped at three Agents and uses only the Mock provider plus local read-only text tools. External providers, Web Search, GitHub, Remote MCP and Android device tools are excluded.</p>
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
