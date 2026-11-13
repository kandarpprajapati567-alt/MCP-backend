"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {Sidebar} from "./Sidebar";
import {navItems} from "@/lib/nav";
type Theme="dark"|"light";
export function DashboardShell({children}:{children:React.ReactNode}){
 const [mobileOpen,setMobileOpen]=useState(false);
 const [sidebarVisible,setSidebarVisible]=useState(true);
 const [collapsed,setCollapsed]=useState(false);
 const [theme,setTheme]=useState<Theme>("dark");
 const pathname=usePathname();
 const home=pathname==="/dashboard";
 const current=navItems.find(item=>item.href===pathname)??navItems.find(item=>item.href!=="/dashboard"&&pathname.startsWith(item.href+"/"));
 useEffect(()=>{try{const saved=window.localStorage.getItem("fs-theme");if(saved==="light"||saved==="dark")setTheme(saved);}catch{}},[]);
 useEffect(()=>{document.documentElement.dataset.theme=theme;try{window.localStorage.setItem("fs-theme",theme);}catch{}},[theme]);
 const props={collapsed,theme,onToggleCollapsed:()=>setCollapsed(value=>!value),onHide:()=>{setSidebarVisible(false);setMobileOpen(false);},onToggleTheme:()=>setTheme(value=>value==="dark"?"light":"dark")};
 return <div className={"app-shell flex min-h-screen"+(home?" is-home-map":"")+(sidebarVisible?"":" sidebar-hidden")}>
  {sidebarVisible&&<aside className={"app-sidebar shrink-0 border-r"+(collapsed?" is-collapsed":"")+(home?" app-sidebar-map":" hidden md:sticky md:top-0 md:block md:h-screen")}><Sidebar {...props}/></aside>}
  {mobileOpen&&<div className="fixed inset-0 z-[90] md:hidden"><button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={()=>setMobileOpen(false)}/><aside className={"app-sidebar mobile-sidebar absolute inset-y-0 left-0 z-10 border-r shadow-2xl"+(collapsed?" is-collapsed":"")}><Sidebar {...props} onNavigate={()=>setMobileOpen(false)}/></aside></div>}
  {home&&!sidebarVisible&&<button type="button" className="map-menu-trigger" onClick={()=>{setSidebarVisible(true);setMobileOpen(true);}} aria-label="Show navigation">☰</button>}
  {home&&sidebarVisible&&<button type="button" className="map-menu-trigger md:hidden" onClick={()=>setMobileOpen(true)} aria-label="Open navigation">☰</button>}
  {!sidebarVisible&&!home&&<button type="button" className="map-menu-trigger" onClick={()=>setSidebarVisible(true)} aria-label="Show navigation">☰</button>}
  <div className="app-main flex min-w-0 flex-1 flex-col">
   {!home&&<header className="app-topbar sticky top-0 z-30 flex items-center gap-4 border-b">
    <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[.03] text-stone-300 md:hidden" onClick={()=>setMobileOpen(true)} aria-label="Open navigation">☰</button>
    <button type="button" className="topbar-sidebar-toggle hidden md:grid" onClick={()=>setSidebarVisible(value=>!value)} aria-label={sidebarVisible?"Hide sidebar":"Show sidebar"} title="Toggle sidebar">☰</button>
    <div className="min-w-0"><p className="truncate text-[13px] font-semibold text-stone-100">{current?.label??"Command centre"}</p><p className="mt-1 hidden truncate text-[10px] text-stone-500 sm:block">{current?.description??"Private AI infrastructure"}</p></div>
    <div className="flex-1"/><span className="workspace-status hidden sm:inline-flex">Owner workspace</span>
    <Link href="/api/v1/health" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.025] px-3 text-[10px] font-semibold text-stone-300"><span className="status-dot"/> API health ↗</Link>
   </header>}
   <main className={"app-main min-w-0 flex-1 overflow-auto"+(home?" app-main-map":"")}>{children}</main>
   {!home&&<footer className="border-t border-white/[.07] px-5 py-4 text-center text-[9px] tracking-wide text-stone-600">FUTURISTIC SYSTEM · PRIVATE AI INFRASTRUCTURE · LOCAL DEVICE PERMISSIONS REMAIN USER-CONTROLLED</footer>}
  </div>
 </div>;
}
