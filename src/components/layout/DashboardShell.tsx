"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { navItems } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const current = navItems.find((item) => item.href === pathname) ?? navItems.find((item) => item.href !== "/dashboard" && pathname.startsWith(item.href));
  return (
    <div className="app-shell flex min-h-screen bg-surface bg-grid">
      <aside className="app-sidebar hidden w-[264px] shrink-0 border-r md:sticky md:top-0 md:block md:h-screen">
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="app-sidebar absolute inset-y-0 left-0 z-10 w-[min(86vw,300px)] border-r shadow-2xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="app-main flex min-w-0 flex-1 flex-col">
        <header className="app-topbar sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b px-4 sm:px-6">
          <button type="button" className="rounded-xl border border-border bg-white/[0.03] p-2.5 text-zinc-300 hover:bg-white/[0.07] md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-100">{current?.label ?? "Futuristic System"}</p>
            <p className="hidden text-[11px] text-zinc-500 sm:block">{current?.description ?? "Personal AI infrastructure"}</p>
          </div>
          <div className="flex-1" />
          <span className="hidden items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-1.5 text-[11px] text-cyan-200 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> Owner workspace
          </span>
          <Link href="/api/v1/health" target="_blank" rel="noopener noreferrer" className="rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-emerald-400/30 hover:text-emerald-300">
            API health ↗
          </Link>
        </header>
        <main className={cn("app-main flex-1 overflow-auto p-4 sm:p-6 lg:p-8")}>{children}</main>
        <footer className="border-t border-border-subtle px-4 py-4 text-center text-[11px] text-zinc-600 sm:px-6">
          Futuristic System · Personal AI Control Centre · Device permissions remain user-controlled
        </footer>
      </div>
    </div>
  );
}
