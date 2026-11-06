"use client";
import {useState} from "react";
import Link from "next/link";
import {Sidebar} from "./Sidebar";
import {cn} from "@/lib/utils";
export function DashboardShell({children}:{children:React.ReactNode}){
 const [mobileOpen,setMobileOpen]=useState(false);
 return <div className="flex min-h-screen bg-surface bg-grid">
  <aside className="hidden w-60 shrink-0 border-r border-border bg-surface-raised md:block"><Sidebar/></aside>
  {mobileOpen&&<div className="fixed inset-0 z-40 md:hidden"><div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={()=>setMobileOpen(false)} aria-hidden/><aside className="absolute left-0 top-0 z-50 h-full w-64 border-r border-border bg-surface-raised shadow-2xl"><Sidebar onNavigate={()=>setMobileOpen(false)}/></aside></div>}
  <div className="flex min-w-0 flex-1 flex-col"><header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface-raised/80 px-4 backdrop-blur-md"><button type="button" className="rounded-lg p-2 text-zinc-400 md:hidden" onClick={()=>setMobileOpen(true)} aria-label="Open navigation"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg></button><Link href="/" className="text-xs text-zinc-400">Futuristic System · Personal Mode</Link><div className="flex-1"/><Link href="/api/v1/health" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-zinc-500">Health</Link></header><main className={cn("flex-1 overflow-auto p-4 sm:p-6 lg:p-8")}>{children}</main></div>
 </div>;
}
