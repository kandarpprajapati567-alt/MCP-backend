import Link from "next/link";

const capabilities = [
  { number: "01", title: "AI orchestration", detail: "Route planner, coding, research, chat and notes workflows to configured model providers." },
  { number: "02", title: "Secure device bridge", detail: "Pair trusted devices with scoped credentials while local permissions stay on the device." },
  { number: "03", title: "Persistent memory", detail: "Keep owner-scoped context and retrieve it across supported agent workflows." },
  { number: "04", title: "MCP tool layer", detail: "Expose validated tools through a standard Model Context Protocol endpoint." },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070b12] text-zinc-100">
      <div className="landing-grid pointer-events-none absolute inset-0" />
      <div className="landing-orb pointer-events-none absolute -top-48 left-1/2 h-[620px] w-[900px] -translate-x-1/2" />
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="sidebar-brand flex h-10 w-10 items-center justify-center rounded-2xl text-teal-200">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="m13 2-9 12h7l-1 8 10-13h-7l0-7Z" /></svg>
          </span>
          <span><span className="block text-sm font-bold tracking-wide">Futuristic System</span><span className="block text-[9px] font-semibold uppercase tracking-[.22em] text-teal-300/70">Personal AI infrastructure</span></span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/api/v1/health" target="_blank" className="hidden rounded-xl border border-white/10 px-4 py-2.5 text-xs text-zinc-400 transition hover:border-teal-300/30 hover:text-teal-200 sm:inline-flex">API status ↗</Link>
          <Link href="/dashboard" className="rounded-xl bg-teal-300 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-teal-950/30 transition hover:bg-teal-200">Open control centre <span aria-hidden>→</span></Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:pb-28 lg:pt-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.18em] text-teal-200">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-300 shadow-[0_0_12px_rgba(94,234,212,.8)]" /> One system. Connected intelligence.
          </div>
          <h1 className="mt-7 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-.045em] text-white sm:text-6xl lg:text-[68px]">
            Your AI tools,
            <span className="block bg-gradient-to-r from-teal-200 via-cyan-300 to-violet-300 bg-clip-text text-transparent">working as one.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-slate-400 sm:text-lg">
            A private orchestration layer for AI providers, validated tools, persistent context and trusted devices. Built to coordinate work without taking control away from you.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/dashboard" className="inline-flex items-center justify-center gap-3 rounded-2xl bg-teal-300 px-6 py-4 text-sm font-bold text-slate-950 shadow-xl shadow-teal-950/30 transition hover:-translate-y-0.5 hover:bg-teal-200">Enter command centre <span aria-hidden>↗</span></Link>
            <Link href="/pairing" className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] px-6 py-4 text-sm font-semibold text-zinc-200 transition hover:border-teal-300/30 hover:bg-white/[0.06]">Pair an Android device</Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Render backend</span>
            <span>Supabase Postgres</span><span>MCP Streamable HTTP</span>
          </div>
        </div>

        <div className="landing-panel relative rounded-[28px] p-4 sm:p-5">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-2 pb-4">
            <div><p className="text-xs font-semibold text-zinc-100">System overview</p><p className="mt-1 text-[10px] text-slate-500">Orchestration at a glance</p></div>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-200">Owner mode</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ["AI providers", "Configurable", "Provider routing"],
              ["Agent runtime", "Orchestrated", "Plan · execute · verify"],
              ["Memory", "Persistent", "Owner-scoped context"],
              ["Device bridge", "Paired access", "Scoped credentials"],
            ].map(([label, value, note]) => (
              <div key={label} className="rounded-2xl border border-white/[0.07] bg-slate-950/50 p-4">
                <p className="text-[10px] text-slate-500">{label}</p><p className="mt-3 text-sm font-semibold text-white">{value}</p><p className="mt-1 text-[9px] text-slate-500">{note}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-2xl border border-teal-300/15 bg-teal-300/[0.045] p-4">
            <div className="flex items-center justify-between"><p className="text-xs font-semibold text-teal-100">Execution pipeline</p><span className="text-[9px] uppercase tracking-wider text-teal-300/70">Modular</span></div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {["Plan", "Route", "Execute", "Verify"].map((step, index) => <div key={step} className="relative rounded-xl border border-white/[0.08] bg-slate-950/60 px-2 py-3 text-center"><span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-teal-300/10 text-[10px] font-bold text-teal-200">{index + 1}</span><span className="mt-2 block text-[10px] font-medium text-zinc-300">{step}</span></div>)}
            </div>
          </div>
          <p className="mt-4 px-1 text-[9px] leading-5 text-slate-500">Illustrative architecture overview. Live service health and configured resources are shown inside the authenticated control centre.</p>
        </div>
      </section>

      <section className="relative z-10 border-t border-white/[0.06] bg-slate-950/35">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="max-w-xl"><p className="text-[10px] font-bold uppercase tracking-[.22em] text-teal-300">Core platform</p><h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">A foundation designed to grow.</h2><p className="mt-4 text-sm leading-7 text-slate-400">One backend coordinates different models and capabilities through clear, secure boundaries.</p></div>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {capabilities.map((item) => <article key={item.number} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 transition hover:-translate-y-1 hover:border-teal-300/20 hover:bg-white/[0.04]"><p className="text-[10px] font-bold tracking-[.18em] text-teal-300/70">{item.number}</p><h3 className="mt-5 text-sm font-semibold text-zinc-100">{item.title}</h3><p className="mt-2 text-xs leading-6 text-slate-400">{item.detail}</p></article>)}
          </div>
        </div>
      </section>
      <footer className="relative z-10 border-t border-white/[0.06] px-5 py-7 text-center text-[10px] text-slate-600">Futuristic System · Private by design · User-controlled execution</footer>
    </main>
  );
}
