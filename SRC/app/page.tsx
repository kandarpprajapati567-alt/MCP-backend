import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-surface bg-grid">
      <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 via-transparent to-violet-500/5" />
      <div className="relative mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-cyan-400">
          Futuristic System
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
          Online Control Centre
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
          Secure backend and web dashboard for AI workflows, providers, search,
          and MCP tools. Companion service for the Android application —
          not a replacement.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-lg bg-cyan-500/15 px-5 py-2.5 text-sm font-medium text-cyan-300 ring-1 ring-cyan-500/40 transition hover:bg-cyan-500/25"
          >
            Open dashboard
          </Link>
          <Link
            href="/api/v1/health"
            className="inline-flex items-center rounded-lg border border-border px-5 py-2.5 text-sm text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
          >
            Health check
          </Link>
        </div>
        <p className="mt-12 text-xs text-zinc-600">
          Frontend scaffold · Backend services report real status only
        </p>
      </div>
    </main>
  );
        }
