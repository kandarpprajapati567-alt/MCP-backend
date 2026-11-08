"use client";

import { useState } from "react";

type PairingResponse = {
  ok?: boolean;
  pairingCode?: string;
  expiresAt?: string;
  expiresInSeconds?: number;
  error?: string;
};

export default function DevicePairingPage() {
  const [adminKey, setAdminKey] = useState("");
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generateCode() {
    setBusy(true);
    setError("");
    setCode("");
    setExpiresAt("");
    setCopied(false);
    try {
      const response = await fetch("/api/v1/devices/pairing", {
        method: "POST",
        cache: "no-store",
        headers: { "x-fs-pairing-admin-key": adminKey },
      });
      const data = (await response.json()) as PairingResponse;
      if (!response.ok || !data.pairingCode || !data.expiresAt) {
        throw new Error(data.error ?? "Pairing code could not be generated.");
      }
      setCode(data.pairingCode);
      setExpiresAt(data.expiresAt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pairing code could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setError("Clipboard access failed. Select and copy the code manually.");
    }
  }

  return (
    <main className="pairing-page relative mx-auto flex min-h-[82vh] max-w-xl items-center px-4 py-12">
      <section className="relative w-full rounded-[28px] border border-teal-300/15 bg-slate-950/90 p-6 shadow-[0_30px_100px_rgba(0,0,0,.45)] sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-teal-300">Futuristic System · Device setup</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Generate Android pairing code</h1>
        <p className="mt-2 text-sm text-zinc-400">Enter the private pairing admin key configured on the backend. The key is used only in this page and is not saved in browser storage.</p>

        <label htmlFor="pairing-admin-key" className="mt-6 block text-sm text-zinc-300">Pairing admin key</label>
        <input
          id="pairing-admin-key"
          type="password"
          autoComplete="off"
          value={adminKey}
          onChange={(event) => setAdminKey(event.target.value)}
          placeholder="Enter FS_PAIRING_ADMIN_KEY"
          className="mt-2 w-full rounded-xl border border-border bg-slate-900/80 px-4 py-3 text-sm text-white placeholder:text-zinc-600"
        />
        <button
          type="button"
          disabled={busy || adminKey.length < 32}
          onClick={() => void generateCode()}
          className="mt-4 w-full rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40"
        >
          {busy ? "Generating…" : code ? "Generate another code" : "Generate pairing code"}
        </button>

        {code && (
          <div className="mt-5 rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4">
            <p className="text-xs text-emerald-300">Generated successfully · valid for 5 minutes</p>
            <p className="mt-2 break-all font-mono text-base text-white select-all">{code}</p>
            <p className="mt-2 text-xs text-zinc-400">Expires: {new Date(expiresAt).toLocaleString()}</p>
            <button type="button" onClick={() => void copyCode()} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm text-white">
              {copied ? "Copied" : "Copy code"}
            </button>
            <p className="mt-3 text-xs text-amber-300">Use this code only in your own Futuristic System app. It is single-use; never share it publicly.</p>
          </div>
        )}

        {error && <p role="alert" className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
        <p className="mt-5 text-xs text-zinc-500">The backend stores only a hash of the pairing code. After the app claims it, the code cannot be reused.</p>
      </section>
    </main>
  );
}
