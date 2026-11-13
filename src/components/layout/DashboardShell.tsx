"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { navItems } from "@/lib/nav";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const current = navItems.find((item) => item.href === pathname) ??
    navItems.find((item) => item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
  return (
    <div className="app-shell flex min-h-screen">
      <aside className="app-sidebar hidden shrink-0 border-r md:sticky md:top-0 md:block md:h-screen">
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="app-sidebar absolute inset-y-0 left-0 z-10 border-r shadow-2xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="app-main flex min-w-0 flex-1 flex-col">
        <header className="app-topbar sticky top-0 z-30 flex items-center gap-4 border-b">
          <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[.03] text-stone-300 hover:bg-white/[.07] md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-tight text-stone-100">{current?.label ?? "Command centre"}</p>
            <p className="mt-1 hidden truncate text-[10px] text-stone-500 sm:block">{current?.description ?? "Private AI infrastructure"}</p>
          </div>
          <div className="flex-1" />
          <span className="workspace-status hidden sm:inline-flex">Owner workspace</span>
          <Link href="/api/v1/health" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.025] px-3 text-[10px] font-semibold text-stone-300 hover:border-[#c2a66b]/40 hover:text-[#e0c88e]">
            <span className="status-dot" /> API health <span aria-hidden>↗</span>
          </Link>
        </header>
        <main className="app-main min-w-0 flex-1 overflow-auto">{children}</main>
        <footer className="border-t border-white/[.07] px-5 py-4 text-center text-[9px] tracking-wide text-stone-600 sm:px-8">
          FUTURISTIC SYSTEM · PRIVATE AI INFRASTRUCTURE · LOCAL DEVICE PERMISSIONS REMAIN USER-CONTROLLED
        </footer>
      </div>
    </div>
  );
}
