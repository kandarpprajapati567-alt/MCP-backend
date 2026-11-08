"use client";

import { useState } from "react";

type Check = { id: string; label: string; status: "ok" | "warning" | "failed" | "locked"; detail: string };
type Props = { connected: boolean; token: string };

function statusFrom(value: unknown): Check["status"] {
  return value === "ok" || value === "not_required" ? "ok" : value === "not_configured" ? "warning" : "failed";
}

export function SystemHealthCheck({ connected, token }: Props) {
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<Check[]>([]);
  const [checkedAt, setCheckedAt] = useState("");

  async function runCheck() {
    setRunning(true);
    setChecks([]);
    const results: Check[] = [];
    const request = async (url: string, headers: Record<string, string> = {}) => {
      const response = await fetch(url, {
        cache: "no-store",
        headers,
        signal: AbortSignal.timeout(7000),
      });
      const data = await response.json().catch(() => ({}));
      return { response, data };
    };

    const [site, backend] = await Promise.allSettled([
      request("/api/v1/health"),
      request("/api/v1/system/health"),
    ]);

    if (site.status === "fulfilled") {
      const db = site.value.data?.services?.database;
      results.push({ id: "website", label: "Vercel website / API", status: site.value.response.ok ? "ok" : "failed", detail: site.value.response.ok ? "Dashboard API responding" : `HTTP ${site.value.response.status}` });
      results.push({ id: "database", label: "Supabase database", status: statusFrom(db), detail: `Database: ${db ?? "unknown"}` });
      results.push({ id: "auth", label: "Authentication service", status: statusFrom(site.value.data?.services?.authentication), detail: `Authentication: ${site.value.data?.services?.authentication ?? "unknown"}` });
    } else {
      results.push({ id: "website", label: "Vercel website / API", status: "failed", detail: "Health endpoint did not respond" });
      results.push({ id: "database", label: "Supabase database", status: "failed", detail: "Could not verify through Vercel health API" });
      results.push({ id: "auth", label: "Authentication service", status: "failed", detail: "Could not verify through Vercel health API" });
    }

    if (backend.status === "fulfilled" && backend.value.data?.reachable) {
      const body = backend.value.data.body;
      const service = body?.services ?? {};
      results.push({ id: "render", label: "Render backend", status: body?.status === "ok" ? "ok" : "warning", detail: `HTTP ${backend.value.data.httpStatus} · status: ${body?.status ?? "responding"}` });
    } else {
      results.push({ id: "render", label: "Render backend", status: "failed", detail: backend.status === "fulfilled" ? backend.value.data?.error ?? "Backend returned an error" : "Backend health request timed out" });
    }

    if (connected) {
      const headers = { "x-fs-owner-token": token };
      const protectedResults = await Promise.allSettled([
        request("/api/v1/devices", headers),
        request("/api/v1/ai/providers/health", headers),
        request("/api/v1/tools", headers),
      ]);
      const [devices, providers, tools] = protectedResults;
      if (devices.status === "fulfilled" && devices.value.response.ok) {
        const list = devices.value.data?.devices ?? [];
        const online = list.filter((item: { status?: string }) => item.status === "online").length;
        results.push({ id: "android", label: "Android device registry", status: list.length ? "ok" : "warning", detail: list.length ? `${list.length} paired device(s), ${online} marked online · last-seen data` : "No paired Android device registered" });
      } else {
        results.push({ id: "android", label: "Android device registry", status: "failed", detail: "Could not read paired device registry" });
      }
      if (providers.status === "fulfilled" && providers.value.response.ok) {
        const list = providers.value.data?.providers ?? [];
        results.push({ id: "ai", label: "AI provider configuration", status: list.length ? "ok" : "warning", detail: list.length ? `${list.length} provider(s) configured; vendor connectivity is not tested by this safe check` : "No AI provider configured; mock/local-safe adapter only" });
      } else {
        results.push({ id: "ai", label: "AI provider configuration", status: "failed", detail: "Provider diagnostics endpoint unavailable" });
      }
      if (tools.status === "fulfilled" && tools.value.response.ok) {
        results.push({ id: "tools", label: "Tool registry", status: "ok", detail: `${(tools.value.data?.tools ?? []).length} registered tool(s) available` });
      } else {
        results.push({ id: "tools", label: "Tool registry", status: "failed", detail: "Could not verify registered tools" });
      }
    } else {
      for (const item of [
        ["android", "Android device registry"],
        ["ai", "AI provider configuration"],
        ["tools", "Tool registry"],
      ]) results.push({ id: item[0], label: item[1], status: "locked", detail: "Connect owner access above to run this protected check" });
    }

    setChecks(results);
    setCheckedAt(new Date().toLocaleString());
    setRunning(false);
  }

  const passed = checks.filter((item) => item.status === "ok").length;
  const failed = checks.filter((item) => item.status === "failed").length;
  const badge = (status: Check["status"]) => status === "ok" ? "PASS" : status === "warning" ? "CHECK" : status === "locked" ? "LOCKED" : "FAIL";
  const tone = (status: Check["status"]) => status === "ok" ? "text-emerald-300 bg-emerald-400/10" : status === "warning" ? "text-amber-300 bg-amber-400/10" : status === "locked" ? "text-zinc-400 bg-zinc-700/30" : "text-red-300 bg-red-400/10";

  return (
    <section className="rounded-2xl border border-cyan-900/50 bg-gradient-to-br from-cyan-950/40 via-zinc-950/90 to-violet-950/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">System diagnostics</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Full System Health Check</h2>
          <p className="mt-1 text-sm text-zinc-400">One click · live endpoint checks · no data changes or paid AI calls</p>
        </div>
        <button type="button" onClick={() => void runCheck()} disabled={running} className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-50">
          {running ? "Checking systems…" : "Run Full System Health Check"}
        </button>
      </div>
      {checks.length > 0 && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <p className="text-sm font-medium text-white">{passed}/{checks.length} checks passed{failed ? ` · ${failed} failed` : ""}</p>
            <p className="text-xs text-zinc-500">Checked {checkedAt}</p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {checks.map((item) => (
              <article key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{item.label}</p>
                  <p className="mt-1 text-xs text-zinc-400">{item.detail}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${tone(item.status)}`}>{badge(item.status)}</span>
              </article>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-zinc-500">Android status reflects registry/last-seen data, not a live device ping. AI provider status confirms configuration only; it does not send a generation request or spend credits.</p>
        </div>
      )}
    </section>
  );
}
