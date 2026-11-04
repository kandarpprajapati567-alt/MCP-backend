"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-surface bg-grid">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface-raised md:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 z-50 h-full w-64 border-r border-border bg-surface-raised shadow-xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface-raised/90 px-4 backdrop-blur">
          <button
            type="button"
            className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div className="flex-1" />
          <span className="hidden text-xs text-zinc-500 sm:inline">
            Backend not connected · placeholder UI
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-zinc-800 text-xs text-zinc-400">
            FS
          </div>
        </header>

        <main className={cn("flex-1 overflow-auto p-4 sm:p-6")}>{children}</main>
      </div>
    </div>
  );
}
