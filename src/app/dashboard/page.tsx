"use client";
import {useCallback,useEffect,useState} from "react";
import {PageHeader} from "@/components/ui/PageHeader";
type Task={id:string;status:string;task:string;result:string|null;created_at:string};
type Provider={provider:string;updated_at:string};
export default function DashboardPage(){
 const [token,setToken]=useState("");const [connected,setConnected]=useState(false);const [connecting,setConnecting]=useState(false);const [error,setError]=useState("");const [message,setMessage]=useState("");
 const [task,setTask]=useState("");const [tasks,setTasks]=useState<Task[]>([]);const [running,setRunning]=useState(false);const [result,setResult]=useState("");
 const [provider,setProvider]=useState("openai");const [apiKey,setApiKey]=useState("");const [providers,setProviders]=useState<Provider[]>([]);
 const api=useCallback(async(path:string,init:RequestInit={})=>fetch(path,{...init,cache:"no-store",headers:{...(init.headers??{}),"x-fs-owner-token":token,...(init.body?{"Content-Type":"application/json"}:{})}}),[token]);
 const refresh=useCallback(async()=>{
  const [t,p]=await Promise.all([api("/api/v1/agent/tasks"),api("/api/v1/ai/providers/keys")]);
  if(!t.ok||!p.ok)throw new Error("Owner access expired. Reconnect with your private token.");
  const td=await t.json();const pd=await p.json();setTasks(td.tasks??[]);setProviders(pd.providers??[]);
 },[api]);
 async function connect(value=token){
  setConnecting(true);setError("");setMessage("");
  try{const response=await fetch("/api/v1/tools",{headers:{"x-fs-owner-token":value},cache:"no-store"});if(!response.ok)throw new Error("Token invalid or backend not ready.");sessionStorage.setItem("fs_owner_token",value);setToken(value);setConnected(true);setMessage("Private owner connection established.");}
  catch(e){setConnected(false);setError(e instanceof Error?e.message:"Could not connect.");}
  finally{setConnecting(false);}
 }
 useEffect(()=>{const saved=sessionStorage.getItem("fs_owner_token");if(saved){setToken(saved);void (async()=>{try{const r=await fetch("/api/v1/tools",{headers:{"x-fs-owner-token":saved},cache:"no-store"});if(r.ok){setConnected(true);}else{sessionStorage.removeItem("fs_owner_token");}}catch{}})();}},[]);
 useEffect(()=>{if(connected){void refresh().catch(e=>{setError(e.message);setConnected(false);});}},[connected,refresh]);
 async function runTask(e:React.FormEvent){e.preventDefault();setRunning(true);setError("");setResult("");try{const r=await api("/api/v1/agent/tasks",{method:"POST",body:JSON.stringify({task})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Task failed.");setResult(d.result??"Completed.");setTask("");await refresh();}catch(e){setError(e instanceof Error?e.message:"Task failed.");}finally{setRunning(false);}}
 async function saveKey(e:React.FormEvent){e.preventDefault();setError("");setMessage("");try{const r=await api("/api/v1/ai/providers/keys",{method:"PUT",body:JSON.stringify({provider,apiKey})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not save key.");setApiKey("");setMessage(provider+" key encrypted and saved.");await refresh();}catch(e){setError(e instanceof Error?e.message:"Could not save key.");}}
 async function removeKey(name:string){if(!window.confirm("Remove saved "+name+" key?"))return;try{const r=await api("/api/v1/ai/providers/keys",{method:"DELETE",body:JSON.stringify({provider:name})});if(!r.ok)throw new Error("Could not remove key.");await refresh();}catch(e){setError(e instanceof Error?e.message:"Could not remove key.");}}
 function disconnect(){sessionStorage.removeItem("fs_owner_token");setToken("");setConnected(false);setTasks([]);setProviders([]);}
 return <div className="mx-auto max-w-5xl space-y-6">
  <PageHeader title="Personal Control Centre" description="Single-owner AI backend · no account registration or sign-in" />
  <section className="rounded-2xl border border-border bg-zinc-950/60 p-5 space-y-3">
   <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-white">Private backend access</h2><span className={connected?"text-emerald-400 text-xs":"text-amber-400 text-xs"}>{connected?"Connected":"Not connected"}</span></div>
   {!connected?<><label className="block text-sm text-zinc-400" htmlFor="owner-token">Owner token (stored only for this browser tab session)</label><input id="owner-token" type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} placeholder="Paste your private owner token" className="w-full rounded-xl border border-border bg-zinc-900 px-4 py-3 text-sm text-white"/><button disabled={connecting||token.length<32} onClick={()=>void connect()} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50">{connecting?"Connecting…":"Connect securely"}</button></>:<button onClick={disconnect} className="rounded-lg border border-border px-3 py-2 text-xs text-zinc-300">Disconnect this session</button>}
   <p className="text-xs text-zinc-500">Never share this token. API requests require it; browser storage clears when this tab session ends.</p>
  </section>
  {connected&&<>
   <section className="rounded-2xl border border-border bg-zinc-950/60 p-5 space-y-4">
    <h2 className="font-semibold text-white">AI Agent</h2><p className="text-sm text-zinc-400">Task → validated plan → allow-listed local tools → synthesis → saved task history.</p>
    <form onSubmit={runTask} className="space-y-3"><textarea value={task} onChange={e=>setTask(e.target.value)} maxLength={4000} rows={4} placeholder="Describe a task… e.g. Count words in this text: Futuristic System backend" className="w-full rounded-xl border border-border bg-zinc-900 px-4 py-3 text-sm text-white"/><button disabled={running||!task.trim()} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50">{running?"Executing…":"Run agent task"}</button></form>
    {result&&<pre className="whitespace-pre-wrap rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4 text-sm text-emerald-200">{result}</pre>}
   </section>
   <section className="rounded-2xl border border-border bg-zinc-950/60 p-5 space-y-4">
    <h2 className="font-semibold text-white">AI Providers</h2><p className="text-sm text-zinc-400">Credentials are encrypted server-side and never returned.</p>
    <form onSubmit={saveKey} className="grid gap-3 sm:grid-cols-[150px_1fr_auto]"><select value={provider} onChange={e=>setProvider(e.target.value)} className="rounded-xl border border-border bg-zinc-900 px-3 py-3 text-sm text-white"><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option><option value="anthropic">Anthropic (storage only)</option><option value="google">Google (storage only)</option></select><input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} minLength={8} maxLength={4096} autoComplete="new-password" placeholder="Provider API key" className="rounded-xl border border-border bg-zinc-900 px-3 py-3 text-sm text-white"/><button disabled={!apiKey.trim()} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50">Save encrypted key</button></form>
    <div className="space-y-2">{providers.map(p=><div key={p.provider} className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><span className="text-sm capitalize text-zinc-200">{p.provider} · saved</span><button onClick={()=>void removeKey(p.provider)} className="text-xs text-red-300">Remove</button></div>)}{providers.length===0&&<p className="text-xs text-zinc-500">No provider keys saved. Local safe tools still work.</p>}</div>
   </section>
   <section className="rounded-2xl border border-border bg-zinc-950/60 p-5 space-y-3">
    <div className="flex items-center justify-between"><h2 className="font-semibold text-white">Task history</h2><button onClick={()=>void refresh()} className="text-xs text-cyan-300">Refresh</button></div>
    {tasks.length===0?<p className="text-sm text-zinc-500">No tasks yet.</p>:tasks.map(t=><article key={t.id} className="rounded-xl border border-border p-3"><div className="flex justify-between gap-3"><p className="text-sm text-zinc-200">{t.task}</p><span className="text-xs text-emerald-300">{t.status}</span></div>{t.result&&<pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-400">{t.result}</pre>}<p className="mt-2 text-[10px] text-zinc-600">{new Date(t.created_at).toLocaleString()}</p></article>)}
   </section>
  </>}
  {error&&<p role="alert" className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
  {message&&<p role="status" className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-3 text-sm text-emerald-300">{message}</p>}
 </div>;
}
