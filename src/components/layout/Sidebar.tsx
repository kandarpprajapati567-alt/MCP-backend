"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import {navGroups,navItems,type NavGroup} from "@/lib/nav";
const glyphs:Record<string,string>={grid:"✧",terminal:"⌘",network:"⌘",activity:"⌁",cpu:"◈",users:"♙",flask:"⚗",layers:"◫",orbit:"◎",message:"◌",plug:"⌁",database:"▤",search:"⌕",code:"</>",settings:"⚙"};
const groupGlyphs:Record<NavGroup,string>={Command:"⌂",Intelligence:"✧",Automation:"⟳","Connected Systems":"◉",Configuration:"⚙"};
type Props={collapsed:boolean;theme:"dark"|"light";onToggleCollapsed:()=>void;onHide:()=>void;onToggleTheme:()=>void;onNavigate?:()=>void};
export function Sidebar({collapsed,theme,onToggleCollapsed,onHide,onToggleTheme,onNavigate}:Props){
 const pathname=usePathname();
 const active=navItems.find(item=>pathname===item.href||(item.href!=="/dashboard"&&pathname.startsWith(item.href+"/")));
 const [expanded,setExpanded]=useState<NavGroup[]>([active?.group??"Command"]);
 useEffect(()=>{if(active&&!expanded.includes(active.group))setExpanded(current=>[...current,active.group]);},[active?.group,expanded]);
 function toggle(group:NavGroup){if(collapsed)onToggleCollapsed();setExpanded(current=>current.includes(group)?current.filter(item=>item!==group):[...current,group]);}
 return <nav aria-label="Main navigation" className="flex h-full flex-col">
  <div className="sidebar-brand-row">
   <Link href="/dashboard" onClick={onNavigate} className="sidebar-brand-link" aria-label="Futuristic System home">
    <span className="sidebar-brand" aria-hidden="true">F</span>
    {!collapsed&&<span className="min-w-0"><span className="block truncate text-[14px] font-bold text-stone-100">Futuristic System</span><span className="mt-1 block text-[8px] font-bold uppercase tracking-[.19em] text-[#c2a66b]">Private command centre</span></span>}
   </Link>
   <button type="button" onClick={onHide} className="sidebar-icon-button" title="Hide sidebar" aria-label="Hide sidebar">‹</button>
  </div>
  {!collapsed&&<div className="px-4 pt-4"><div className="workspace-chip"><span className="status-dot"/><span><strong>Owner workspace</strong><small>Private environment</small></span></div></div>}
  <div className="flex-1 overflow-y-auto px-2 pb-4 pt-3">
   {navGroups.map(group=>{const items=navItems.filter(item=>item.group===group);const open=expanded.includes(group);return <section key={group} className="sidebar-group">
    <button type="button" onClick={()=>toggle(group)} className={"sidebar-group-trigger"+(active?.group===group?" is-active":"")} aria-expanded={open} title={group}>
     <span className="sidebar-group-glyph" aria-hidden="true">{groupGlyphs[group]}</span>
     {!collapsed&&<><span className="min-w-0 flex-1 truncate text-left">{group}</span><span className={"sidebar-chevron"+(open?" is-open":"")}>⌄</span></>}
    </button>
    {!collapsed&&open&&<ul className="sidebar-submenu">{items.map(item=>{const selected=pathname===item.href||(item.href!=="/dashboard"&&pathname.startsWith(item.href+"/"));return <li key={item.href}>
     <Link href={item.href} onClick={onNavigate} aria-current={selected?"page":undefined} title={item.description} className={"sidebar-link"+(selected?" is-active":"")}>
      <span className="sidebar-link-glyph" aria-hidden="true">{glyphs[item.icon]??"·"}</span><span className="min-w-0 flex-1 truncate">{item.label}</span>{selected&&<span className="sidebar-active-dot"/>}
     </Link>
    </li>;})}</ul>}
   </section>;})}
  </div>
  <div className="sidebar-bottom">
   <button type="button" onClick={onToggleTheme} className="sidebar-footer-action" title={theme==="dark"?"Switch to light theme":"Switch to dark theme"}><span aria-hidden="true">{theme==="dark"?"☼":"☾"}</span>{!collapsed&&<span>{theme==="dark"?"Light appearance":"Dark appearance"}</span>}</button>
   <button type="button" onClick={onToggleCollapsed} className="sidebar-footer-action" title={collapsed?"Expand sidebar":"Collapse sidebar"}><span aria-hidden="true">{collapsed?"›":"‹"}</span>{!collapsed&&<span>Collapse navigation</span>}</button>
   {!collapsed&&<p className="sidebar-security-note">Device permissions remain local and user-controlled.</p>}
  </div>
 </nav>;
}
