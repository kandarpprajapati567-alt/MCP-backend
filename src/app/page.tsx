import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-surface bg-grid bg-glow">
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 py-1"><span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /><span className="text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-300/90">Futuristic System</span></div>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl lg:text-6xl">Online Control Centre</h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">Secure backend and web dashboard for AI workflows, providers, search, and MCP tools. Companion service for the Android application — not a replacement.</p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" className="inline-flex items-center rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300">Login / Create account</Link>
          <Link href="/dashboard" className="inline-flex items-center rounded-xl border border-border bg-zinc-900/50 px-5 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800/50 hover:text-zinc-100">Open dashboard</Link>
          <Link href="/api/v1/health" className="inline-flex items-center rounded-xl border border-border px-5 py-2.5 text-sm text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200">Health check</Link>
        </div>
        <div className="mt-16 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
          {[{label:"Auth",desc:"Supabase SSR sessions"},{label:"AI keys",desc:"Encrypted server-side"},{label:"MCP",desc:"Tools roadmap"}].map((item)=><div key={item.label} className="rounded-xl border border-border bg-zinc-950/40 px-4 py-3 text-left"><p className="text-sm font-medium text-zinc-200">{item.label}</p><p className="mt-0.5 text-xs text-zinc-500">{item.desc}</p></div>)}
        </div>
        <p className="mt-12 text-xs text-zinc-600">Frontend scaffold · Backend services report real status only</p>
      </div>
    </main>
  );
}
