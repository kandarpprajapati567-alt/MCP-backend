import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface bg-grid bg-glow px-6 py-16 text-center">
      <div className="max-w-3xl">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-300">Futuristic System</span>
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 sm:text-6xl">MCP Command Centre</h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-zinc-400">
          A central AI backend for model routing, agent orchestration, MCP tools, memory and connected applications.
        </p>
        <Link href="/dashboard" className="mt-9 inline-flex rounded-xl bg-cyan-400 px-6 py-3 text-sm font-semibold text-zinc-950">
          Open Command Centre
        </Link>
        <p className="mt-8 text-xs text-zinc-600">Personal owner mode · No signup or account login</p>
      </div>
    </main>
  );
}
