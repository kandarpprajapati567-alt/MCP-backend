"use client";

import { FormEvent, useEffect, useState } from "react";

type User = { id: string; email: string | null };
type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadProfile() {
    setLoading(true);
    setError("");
    try {
      const authResponse = await fetch("/api/v1/auth/me", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const auth = await authResponse.json();
      if (!authResponse.ok || !auth.user) {
        setUser(null);
        setProfile(null);
        setError("Please sign in to view your profile.");
        return;
      }
      setUser(auth.user);
      const profileResponse = await fetch("/api/v1/profile", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = await profileResponse.json();
      if (!profileResponse.ok) throw new Error(result.error ?? "Could not load profile.");
      const p = result.profile as Profile | null;
      setProfile(p);
      setDisplayName(p?.display_name ?? "");
      setAvatarUrl(p?.avatar_url ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/v1/profile", {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save profile.");
      setProfile(result.profile);
      setDisplayName(result.profile?.display_name ?? "");
      setAvatarUrl(result.profile?.avatar_url ?? "");
      setMessage("Profile saved successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Sign out failed. Please retry.");
      window.location.href = "/login";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign out failed.");
    }
  }

  return (
    <main className="min-h-screen bg-surface px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Futuristic System</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Your dashboard</h1>
            <p className="mt-1 text-sm text-zinc-400">Account and profile settings</p>
          </div>
          {user && (
            <button onClick={signOut} type="button" className="rounded-xl border border-border px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white">
              Sign out
            </button>
          )}
        </header>

        <section className="rounded-2xl border border-border bg-zinc-950/80 p-5 sm:p-7">
          <h2 className="text-lg font-semibold text-white">Account</h2>
          {loading ? (
            <p className="mt-4 text-sm text-zinc-400">Checking secure session…</p>
          ) : user ? (
            <div className="mt-4 space-y-2 text-sm">
              <p className="text-emerald-300">Authenticated session verified</p>
              <p className="break-all text-zinc-300">{user.email}</p>
              <p className="break-all text-xs text-zinc-500">User ID: {user.id}</p>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-zinc-300">You are not signed in.</p>
              <a href="/login" className="mt-3 inline-block rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950">Go to login</a>
            </div>
          )}
        </section>

        {user && (
          <section className="rounded-2xl border border-border bg-zinc-950/80 p-5 sm:p-7">
            <h2 className="text-lg font-semibold text-white">Profile</h2>
            <p className="mt-1 text-sm text-zinc-400">Your profile is linked to your authenticated account. Only your own profile can be changed.</p>
            <form onSubmit={saveProfile} className="mt-6 space-y-5">
              <div>
                <label htmlFor="display-name" className="mb-2 block text-sm font-medium text-zinc-300">Display name</label>
                <input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} placeholder="Your name (optional)" className="w-full rounded-xl border border-border bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400 focus:outline-none" />
                <p className="mt-1 text-xs text-zinc-500">Up to 80 characters.</p>
              </div>
              <div>
                <label htmlFor="avatar-url" className="mb-2 block text-sm font-medium text-zinc-300">Avatar image URL</label>
                <input id="avatar-url" type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} maxLength={2048} placeholder="https://example.com/avatar.png (optional)" className="w-full rounded-xl border border-border bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400 focus:outline-none" />
                <p className="mt-1 text-xs text-zinc-500">Use an HTTP or HTTPS image URL.</p>
              </div>
              {avatarUrl && (
                <div className="flex items-center gap-3">
                  <img src={avatarUrl} alt="Profile avatar preview" referrerPolicy="no-referrer" className="h-12 w-12 rounded-full border border-border object-cover" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                  <span className="text-xs text-zinc-500">Avatar preview</span>
                </div>
              )}
              {error && <p role="alert" className="rounded-xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</p>}
              {message && <p role="status" className="rounded-xl border border-emerald-900/70 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">{message}</p>}
              <button type="submit" disabled={saving || loading} className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-cyan-300 disabled:opacity-60">{saving ? "Saving…" : "Save profile"}</button>
              {profile?.updated_at && <p className="text-xs text-zinc-600">Last updated: {new Date(profile.updated_at).toLocaleString()}</p>}
            </form>
          </section>
        )}
        {!user && error && <p role="alert" className="rounded-xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</p>}
      </div>
    </main>
  );
}
