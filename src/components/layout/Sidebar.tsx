"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/nav";

const glyphs: Record<string, string> = {
  grid: "▦", network: "⌘", activity: "⌁", cpu: "◈", users: "♙",
  flask: "⚗", layers: "▱", orbit: "◎", message: "◌", plug: "⌁",
  terminal: "⌘", database: "▤", search: "⌕", code: "</>", settings: "⚙",
};
const groups = ["Command", "Intelligence", "Infrastructure", "Configuration"] as const;

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="flex h-full flex-col">
      <Link href="/dashboard" onClick={onNavigate} className="flex min-h-[92px] items-center gap-3 border-b border-white/[.07] px-5">
        <span className="sidebar-brand text-xl font-black" aria-hidden="true">F</span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-bold tracking-tight text-stone-100">Futuristic System</span>
          <span className="mt-1 block text-[9px] font-bold uppercase tracking-[.2em] text-[#c2a66b]">Private command centre</span>
        </span>
      </Link>
      <div className="px-5 pt-5">
        <div className="rounded-xl border border-white/[.08] bg-white/[.025] px-3 py-3">
          <p className="text-[8px] font-bold uppercase tracking-[.2em] text-stone-500">Workspace mode</p>
          <p className="mt-1.5 flex items-center gap-2 text-[11px] font-semibold text-stone-200"><span className="status-dot" /> Owner environment</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-5">
        {groups.map((group) => (
          <section key={group} aria-label={group}>
            <p className="nav-group-label">{group}</p>
            <ul className="space-y-1">
              {navItems.filter((item) => item.group === group).map((item) => {
                const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
                return (
                  <li key={item.href}>
                    <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} title={item.description}
                      className={`sidebar-link group flex items-center gap-3 px-3 text-[12px] font-medium ${active ? "text-[#e0c88e]" : "text-stone-400"}`}>
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[13px] ${active ? "border-[#c2a66b]/30 bg-[#c2a66b]/10 text-[#e0c88e]" : "border-white/[.07] bg-white/[.025] text-stone-500 group-hover:text-stone-200"}`} aria-hidden="true">{glyphs[item.icon] ?? "·"}</span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-[#c2a66b]" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <div className="border-t border-white/[.07] p-4">
        <div className="sidebar-footer rounded-xl px-3.5 py-3">
          <p className="text-[8px] font-bold uppercase tracking-[.18em] text-stone-500">Security boundary</p>
          <p className="mt-1.5 text-[10px] leading-5 text-stone-300">Device permissions remain local and user-controlled.</p>
        </div>
        <p className="mt-3 px-1 text-[9px] text-stone-600">FUTURISTIC SYSTEM · PRIVATE BUILD</p>
      </div>
    </nav>
  );
}
