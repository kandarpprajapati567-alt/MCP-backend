"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

type CheckId = "valid_envelope" | "reject_unknown_fields" | "event_deduplication" | "session_isolation" | "timestamp_validation" | "telegram_secret" | "telegram_allowlist" | "telegram_payload";
type CheckResult = { id: CheckId; name: string; status: "passed" | "failed"; detail: string };
type CheckResponse = { summary?: { total: number; passed: number; failed: number; status: string }; results?: CheckResult[]; error?: string; note?: string };

const checks: Array<{ id: CheckId; name: string; description: string }> = [
  { id: "valid_envelope", name: "Normalized message validation", description: "Accept a valid versioned message after identity linking." },
  { id: "reject_unknown_fields", name: "Reject untrusted payload fields", description: "Reject credentials, tool arguments and unknown provider fields." },
  { id: "event_deduplication", name: "Event replay key", description: "Generate a stable channel-scoped key for duplicate provider events." },
  { id: "session_isolation", name: "Conversation isolation", description: "Keep owner, channel, sender and conversation scopes separate." },
  { id: "timestamp_validation", name: "Strict timestamp validation", description: "Reject impossible calendar timestamps." },
  { id: "telegram_secret", name: "Telegram webhook secret", description: "Verify the webhook secret using a constant-time comparison; fail closed if missing." },
  { id: "telegram_allowlist", name: "Telegram sender allowlist", description: "Accept only an exact numeric Telegram user ID explicitly allowlisted by the owner." },
  { id: "telegram_payload", name: "Telegram private text payload", description: "Accept private human text only; reject groups, bots, attachments and unknown fields." },
];

const channels = [
  { name: "Telegram", state: "Foundation ready", note: "Webhook signature verification and identity linking are not connected yet." },
  { name: "Discord", state: "Planned", note: "Interaction signature verification and identity linking are not connected yet." },
  { name: "WhatsApp", state: "Planned", note: "Meta Business setup, opt-in and possible messaging charges apply." },
  { name: "Website chat", state: "Planned", note: "Authenticated chat UI and task streaming are not connected yet." },
  { name: "Android app", state: "Planned", note: "Device identity and Android permission bridge remain separate integration gates." },
];

export default function BotChannelsPage() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [summary, setSummary] = useState<CheckResponse["summary"]>();
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function runTest(testId: CheckId | "all") {
    if (!token.trim()) {
      setError("Enter the owner master token first. It is kept only in this page's memory.");
      return;
    }
    setBusy(testId);
    setError("");
    setNote("");
    try {
      const response = await fetch("/api/v1/channels/test", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "x-fs-owner-token": token },
        body: JSON.stringify({ testId }),
      });
      const data = await response.json() as CheckResponse;
      if (response.status === 401) {
        setConnected(false);
        throw new Error("Owner token rejected. Check the token and try again.");
      }
      if (!response.ok && !data.results) throw new Error(data.error ?? `Test request failed (HTTP ${response.status}).`);
      setConnected(true);
      const nextResults = testId === "all"
        ? (data.results ?? [])
        : [...results.filter((item) => item.id !== testId), ...(data.results ?? [])];
      setResults(nextResults);
      const passed = nextResults.filter((item) => item.status === "passed").length;
      const failed = nextResults.filter((item) => item.status === "failed").length;
      setSummary(testId === "all"
        ? data.summary
        : { total: nextResults.length, passed, failed, status: failed === 0 ? "passed" : "failed" });
      setNote(data.note ?? "");
      if (data.summary?.failed) setError(`${data.summary.failed} check(s) failed. Inspect the report below.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Channel contract test failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Bot & Channel Gateway" description="One shared Agent Engine, multiple secure interfaces. Run contract and Telegram inbound security checks. Live provider delivery remains disabled until credentials, persistent replay protection and end-to-end task routing are configured." />

      <section className="panel mb-6 rounded-2xl border border-white/[0.08] bg-slate-950/70 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Channel contract Test Center</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">Owner-authenticated backend checks · no provider API calls · no AI inference cost</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${connected ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{connected ? "Owner verified" : "Not connected"}</span>
        </div>

        <label className="mt-5 block text-xs font-medium text-slate-300" htmlFor="owner-token">Owner master token</label>
        <input id="owner-token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste FS owner token" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-teal-400/50" />
        <p className="mt-2 text-[11px] text-slate-500">Token stays in page memory and is sent only to this same-origin backend. It is not stored in localStorage or shown in reports.</p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" disabled={busy !== null} onClick={() => void runTest("all")} className="rounded-xl bg-teal-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 disabled:opacity-50">{busy === "all" ? "Running..." : "Run all channel tests"}</button>
          <button type="button" disabled={busy !== null} onClick={() => { setToken(""); setConnected(false); setResults([]); setSummary(undefined); setNote(""); setError(""); }} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-300 hover:bg-white/[0.04] disabled:opacity-50">Clear token & report</button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {checks.map((check) => {
            const result = results.find((item) => item.id === check.id);
            return (
              <div key={check.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{check.name}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{check.description}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase ${result?.status === "passed" ? "bg-emerald-400/10 text-emerald-300" : result?.status === "failed" ? "bg-rose-400/10 text-rose-300" : "bg-slate-700/60 text-slate-400"}`}>{result?.status ?? "Not run"}</span>
                </div>
                <button type="button" disabled={busy !== null} onClick={() => void runTest(check.id)} className="mt-4 rounded-lg border border-teal-400/20 px-3 py-2 text-xs font-semibold text-teal-200 hover:bg-teal-400/[0.06] disabled:opacity-50">{busy === check.id ? "Testing..." : "Test this check"}</button>
                {result && <p className="mt-3 text-xs leading-5 text-slate-400">{result.detail}</p>}
              </div>
            );
          })}
        </div>

        {summary && <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Latest test report</h3>
            <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${summary.failed === 0 ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}>{summary.status}</span>
          </div>
          <p className="mt-2 text-xs text-slate-300">Total: {summary.total} · Passed: {summary.passed} · Failed: {summary.failed}</p>
        </div>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-xs text-rose-200">{error}</p>}
        {note && <p className="mt-4 text-[11px] leading-5 text-amber-200/80">{note}</p>}
      </section>

      <section className="panel rounded-2xl border border-white/[0.08] bg-slate-950/70 p-4 sm:p-6">
        <h2 className="text-base font-semibold text-white">Channel rollout status</h2>
        <p className="mt-1 text-xs leading-5 text-slate-400">No channel is marked connected until authentication, identity linking, deduplication, permissions and end-to-end delivery are proven.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {channels.map((channel) => <div key={channel.name} className="rounded-xl border border-white/[0.08] p-4">
            <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-100">{channel.name}</h3><span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[9px] font-bold uppercase text-amber-200">{channel.state}</span></div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{channel.note}</p>
          </div>)}
        </div>
      </section>
    </div>
  );
}
