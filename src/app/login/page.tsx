"use client";

import { FormEvent, useEffect, useState } from "react";

type AuthUser = { id: string; email: string | null };

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshSession() {
    try {
      const response = await fetch("/api/v1/auth/me", { cache: "no-store" });
      const result = await response.json();
      setUser(response.ok ? result.user : null);
    } catch {
      setUser(null);
    }
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        mode === "login" ? "/api/v1/auth/login" : "/api/v1/auth/signup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ email: email.trim(), password }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Request failed. Please try again.");
        return;
      }
      setPassword("");
      setMessage(result.message ?? (mode === "login" ? "Login successful." : "Account created."));
      if (mode === "login") await refreshSession();
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Logout failed.");
      setUser(null);
      setMessage("Logged out. Session status refreshed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Logout failed.");
    } finally {
      setBusy(false);
      await refreshSession();
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-surface bg-grid px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-violet-500/10" />
      <div className="relative mx-auto flex min-h-[80vh] max-w-5xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-3xl border border-border bg-zinc-950/90 shadow-2xl shadow-cyan-950/20 md:grid-cols-[1fr_1fr]">
          <div className="flex flex-col justify-between border-b border-border bg-gradient-to-br from-cyan-950/50 to-violet-950/30 p-7 sm:p-10 md:border-b-0 md:border-r">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Futuristic System</p>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Your control centre starts here.</h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-zinc-400">Sign in to test your account, verify the live session, and safely sign out. This page talks directly to the production authentication API.</p>
            </div>
            <div className="mt-8 rounded-2xl border border-cyan-900/70 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Session status</p>
              {user ? (
                <>
                  <p className="mt-2 text-sm font-medium text-emerald-300">Authenticated</p>
                  <p className="mt-1 break-all text-sm text-zinc-300">{user.email}</p>
                  <p className="mt-2 break-all text-xs text-zinc-600">User ID: {user.id}</p>
                </>
              ) : (
                <p className="mt-2 text-sm text-zinc-300">No active session detected</p>
              )}
            </div>
          </div>

          <div className="p-6 sm:p-10">
            <div className="flex rounded-xl border border-border bg-black/30 p-1">
              <button type="button" onClick={() => { setMode("login"); setMessage(""); setError(""); }} className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition ${mode === "login" ? "bg-cyan-400 text-zinc-950" : "text-zinc-400 hover:text-white"}`}>Login</button>
              <button type="button" onClick={() => { setMode("signup"); setMessage(""); setError(""); }} className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition ${mode === "signup" ? "bg-cyan-400 text-zinc-950" : "text-zinc-400 hover:text-white"}`}>Create account</button>
            </div>

            <h2 className="mt-7 text-xl font-semibold text-white">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
            <p className="mt-2 text-sm text-zinc-400">{mode === "login" ? "Use the email you verified and your current password." : "We’ll send a confirmation email if verification is required."}</p>

            <form className="mt-6 space-y-4" onSubmit={submit}>
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-zinc-300">Email address</label>
                <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-xl border border-border bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400 focus:outline-none" />
              </div>
              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-zinc-300">Password</label>
                <div className="flex rounded-xl border border-border bg-zinc-900 focus-within:border-cyan-400">
                  <input id="password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "signup" ? 8 : undefined} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"} className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none" />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="px-3 text-xs font-medium text-cyan-300 hover:text-cyan-100">{showPassword ? "Hide" : "Show"}</button>
                </div>
              </div>
              {error && <p role="alert" className="rounded-xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</p>}
              {message && <p role="status" className="rounded-xl border border-emerald-900/70 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">{message}</p>}
              <button type="submit" disabled={busy} className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
            </form>

            {user && <button type="button" onClick={logout} disabled={busy} className="mt-3 w-full rounded-xl border border-border px-4 py-3 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-60">{busy ? "Please wait…" : "Sign out"}</button>}
            <p className="mt-6 text-center text-xs leading-5 text-zinc-600">Never share your password or session cookies. This page does not display or store your password.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
