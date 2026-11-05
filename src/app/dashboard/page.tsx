"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

type User = { id: string; email: string | null };
type Profile = { id: string; display_name: string | null; avatar_url: string | null; created_at: string; updated_at: string };

export default function DashboardPage() {
  const [user,setUser]=useState<User|null>(null);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [displayName,setDisplayName]=useState("");
  const [avatarUrl,setAvatarUrl]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [mockPrompt,setMockPrompt]=useState("Explain the purpose of an AI provider interface in one sentence.");
  const [mockLoading,setMockLoading]=useState(false);
  const [mockResult,setMockResult]=useState("");
  const [mockError,setMockError]=useState("");
  const [providerName,setProviderName]=useState("openai");
  const [providerApiKey,setProviderApiKey]=useState("");
  const [providerKeys,setProviderKeys]=useState<Array<{provider:string;created_at:string;updated_at:string}>>([]);
  const [providerLoading,setProviderLoading]=useState(false);
  const [providerSaving,setProviderSaving]=useState(false);
  const [providerMessage,setProviderMessage]=useState("");
  const [providerError,setProviderError]=useState("");

  async function loadProfile() {
    setLoading(true);setError("");
    try {
      const authResponse=await fetch("/api/v1/auth/me",{cache:"no-store",credentials:"same-origin"});
      const auth=await authResponse.json();
      if(!authResponse.ok||!auth.user){setUser(null);setProfile(null);setError("Please sign in to view your profile.");return;}
      setUser(auth.user);
      const profileResponse=await fetch("/api/v1/profile",{cache:"no-store",credentials:"same-origin"});
      const result=await profileResponse.json();
      if(!profileResponse.ok)throw new Error(result.error??"Could not load profile.");
      const p=result.profile as Profile|null;setProfile(p);setDisplayName(p?.display_name??"");setAvatarUrl(p?.avatar_url??"");
    } catch(e){setError(e instanceof Error?e.message:"Could not load your profile.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void loadProfile();},[]);

  async function loadProviderKeys() {
    setProviderLoading(true);setProviderError("");
    try {
      const response=await fetch("/api/v1/ai/providers/keys",{cache:"no-store",credentials:"same-origin"});
      const result=await response.json();if(!response.ok)throw new Error(result.error??"Could not load provider settings.");
      setProviderKeys(result.providers??[]);
    } catch(e){setProviderError(e instanceof Error?e.message:"Could not load provider settings.");}
    finally{setProviderLoading(false);}
  }
  useEffect(()=>{if(user)void loadProviderKeys();else setProviderKeys([]);},[user]);

  async function saveProfile(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setSaving(true);setMessage("");setError("");
    try {
      const response=await fetch("/api/v1/profile",{method:"PATCH",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({display_name:displayName.trim()||null,avatar_url:avatarUrl.trim()||null})});
      const result=await response.json();if(!response.ok)throw new Error(result.error??"Could not save profile.");
      setProfile(result.profile);setDisplayName(result.profile?.display_name??"");setAvatarUrl(result.profile?.avatar_url??"");setMessage("Profile saved successfully.");
    } catch(e){setError(e instanceof Error?e.message:"Could not save profile.");}
    finally{setSaving(false);}
  }

  async function saveProviderKey(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setProviderSaving(true);setProviderMessage("");setProviderError("");
    try {
      const response=await fetch("/api/v1/ai/providers/keys",{method:"PUT",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider:providerName,apiKey:providerApiKey})});
      const result=await response.json();if(!response.ok)throw new Error(result.error??"Could not save provider key.");
      setProviderApiKey("");setProviderMessage(`${providerName} key encrypted and saved. The key itself is never displayed.`);await loadProviderKeys();
    } catch(e){setProviderError(e instanceof Error?e.message:"Could not save provider key.");}
    finally{setProviderSaving(false);}
  }

  async function deleteProviderKey(provider:string) {
    if(!window.confirm(`Remove the saved ${provider} API key?`))return;
    setProviderMessage("");setProviderError("");
    try {
      const response=await fetch("/api/v1/ai/providers/keys",{method:"DELETE",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider})});
      const result=await response.json();if(!response.ok)throw new Error(result.error??"Could not remove provider key.");
      setProviderMessage(`${provider} key removed.`);await loadProviderKeys();
    } catch(e){setProviderError(e instanceof Error?e.message:"Could not remove provider key.");}
  }

  async function testMockAI(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setMockLoading(true);setMockResult("");setMockError("");
    try {
      const response=await fetch("/api/v1/ai/providers/mock/test",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:mockPrompt.trim()})});
      const result=await response.json();if(!response.ok)throw new Error(result.error?.message??result.error??"Mock AI test failed.");
      setMockResult(result.result?.text??result.output?.text??result.text??"Mock AI responded successfully.");
    } catch(e){setMockError(e instanceof Error?e.message:"Mock AI test failed.");}
    finally{setMockLoading(false);}
  }

  async function signOut() {
    setError("");setMessage("");
    try {
      const response=await fetch("/api/v1/auth/logout",{method:"POST",credentials:"same-origin",cache:"no-store"});
      if(!response.ok)throw new Error("Sign out failed. Please retry.");window.location.href="/login";
    } catch(e){setError(e instanceof Error?e.message:"Sign out failed.");}
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><PageHeader title="Dashboard" description="Account, profile, and AI provider controls" />{user&&<button onClick={signOut} type="button" className="rounded-xl border border-border px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white">Sign out</button>}</div>
      <Card><CardHeader title="Account" description="Authenticated session status" />
        {loading?<p className="text-sm text-zinc-400">Checking secure session…</p>:user?<div className="flex flex-wrap items-center gap-3"><StatusBadge status="ok" /><div className="min-w-0"><p className="truncate text-sm text-zinc-200">{user.email}</p><p className="truncate text-xs text-zinc-500">ID: {user.id}</p></div></div>:<div className="space-y-3"><StatusBadge status="not_configured" /><p className="text-sm text-zinc-400">You are not signed in.</p><Link href="/login" className="inline-flex rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300">Go to login</Link></div>}
      </Card>
      {user&&<>
        <Card><CardHeader title="Mock AI provider test" description="Authenticated endpoint. Deterministic mock — no API key required." />
          <form onSubmit={testMockAI} className="space-y-4"><div><label htmlFor="mock-ai-prompt" className="mb-1.5 block text-sm font-medium text-zinc-300">Test prompt</label><textarea id="mock-ai-prompt" value={mockPrompt} onChange={e=>setMockPrompt(e.target.value)} maxLength={1000} required rows={3} className="w-full rounded-xl border border-border bg-zinc-900/80 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400 focus:outline-none" /></div><button type="submit" disabled={mockLoading||!mockPrompt.trim()} className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-60">{mockLoading?"Testing…":"Run Mock AI test"}</button></form>
          {mockError&&<p role="alert" className="mt-4 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">{mockError}</p>}
          {mockResult&&<div role="status" className="mt-4 rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Mock response</p><p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">{mockResult}</p></div>}
        </Card>
        <Card><CardHeader title="AI provider API keys" description="Keys are encrypted on the server and never returned to the browser after saving." />
          <form onSubmit={saveProviderKey} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="provider-name" className="mb-1.5 block text-sm font-medium text-zinc-300">Provider</label><select id="provider-name" value={providerName} onChange={e=>setProviderName(e.target.value)} className="w-full rounded-xl border border-border bg-zinc-900/80 px-4 py-3 text-sm text-white focus:border-cyan-400 focus:outline-none"><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="google">Google</option><option value="openrouter">OpenRouter</option></select></div>
            <div><label htmlFor="provider-api-key" className="mb-1.5 block text-sm font-medium text-zinc-300">API key</label><input id="provider-api-key" type="password" value={providerApiKey} onChange={e=>setProviderApiKey(e.target.value)} minLength={8} maxLength={4096} autoComplete="new-password" autoCapitalize="none" spellCheck={false} required placeholder="Paste provider API key" className="w-full rounded-xl border border-border bg-zinc-900/80 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400 focus:outline-none" /></div>
          </div><p className="text-xs text-zinc-500">Saved keys cannot be viewed again. Saving replaces the existing key for this provider.</p><button type="submit" disabled={providerSaving||!providerApiKey.trim()} className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-60">{providerSaving?"Encrypting and saving…":"Save provider key"}</button></form>
          <div className="mt-6 border-t border-border pt-5"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-white">Saved providers</h3><button type="button" onClick={loadProviderKeys} disabled={providerLoading} className="text-xs text-cyan-400 transition hover:text-cyan-300 disabled:opacity-60">{providerLoading?"Refreshing…":"Refresh"}</button></div>
            {providerLoading?<p className="mt-3 text-sm text-zinc-400">Loading saved providers…</p>:providerKeys.length===0?<p className="mt-3 text-sm text-zinc-500">No provider keys saved yet.</p>:<ul className="mt-3 space-y-2">{providerKeys.map(item=><li key={item.provider} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-zinc-900/50 px-4 py-3"><div><p className="text-sm font-medium capitalize text-zinc-200">{item.provider}</p><p className="mt-0.5 text-xs text-zinc-500">Saved {new Date(item.updated_at).toLocaleString()}</p></div><button type="button" onClick={()=>void deleteProviderKey(item.provider)} className="rounded-lg border border-red-900/50 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-950/40">Remove</button></li>)}</ul>}
          </div>
          {providerError&&<p role="alert" className="mt-4 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">{providerError}</p>}
          {providerMessage&&<p role="status" className="mt-4 rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">{providerMessage}</p>}
        </Card>
        <Card><CardHeader title="Profile" description="Linked to your authenticated account. Only your own profile can be changed." />
          <form onSubmit={saveProfile} className="space-y-5"><div><label htmlFor="display-name" className="mb-1.5 block text-sm font-medium text-zinc-300">Display name</label><input id="display-name" value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={80} placeholder="Your name (optional)" className="w-full rounded-xl border border-border bg-zinc-900/80 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400 focus:outline-none" /><p className="mt-1 text-xs text-zinc-500">Up to 80 characters.</p></div>
            <div><label htmlFor="avatar-url" className="mb-1.5 block text-sm font-medium text-zinc-300">Avatar image URL</label><input id="avatar-url" type="url" value={avatarUrl} onChange={e=>setAvatarUrl(e.target.value)} maxLength={2048} placeholder="https://example.com/avatar.png (optional)" className="w-full rounded-xl border border-border bg-zinc-900/80 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400 focus:outline-none" /><p className="mt-1 text-xs text-zinc-500">Use an HTTP or HTTPS image URL.</p></div>
            {avatarUrl&&<div className="flex items-center gap-3"><img src={avatarUrl} alt="Profile avatar preview" referrerPolicy="no-referrer" className="h-12 w-12 rounded-full border border-border object-cover" onError={e=>{e.currentTarget.style.visibility="hidden";}} /><span className="text-xs text-zinc-500">Avatar preview</span></div>}
            {error&&<p role="alert" className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</p>}
            {message&&<p role="status" className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">{message}</p>}
            <button type="submit" disabled={saving||loading} className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-60">{saving?"Saving…":"Save profile"}</button>
            {profile?.updated_at&&<p className="text-xs text-zinc-600">Last updated: {new Date(profile.updated_at).toLocaleString()}</p>}
          </form>
        </Card>
      </>}
      {!user&&error&&<p role="alert" className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</p>}
    </div>
  );
}
