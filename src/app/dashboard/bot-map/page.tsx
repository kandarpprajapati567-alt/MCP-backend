import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";

const channels = [
  { name: "Website", code: "WEB", stage: "Planned", detail: "Authenticated chat interface and streaming task updates are not connected.", tone: "paper" },
  { name: "Telegram", code: "TG", stage: "Contract foundation", detail: "Message envelope and contract checks exist; webhook signature verification and identity linking remain gated.", tone: "brass" },
  { name: "Discord", code: "DC", stage: "Planned", detail: "Interaction signature verification, identity linking and delivery are not connected.", tone: "violet" },
  { name: "WhatsApp", code: "WA", stage: "Planned", detail: "Business account, opt-in, webhook verification and possible messaging charges are required.", tone: "olive" },
  { name: "Android client", code: "AND", stage: "Separate device bridge", detail: "Local Android permissions and device-side execution remain controlled by the app.", tone: "red" },
];

export default function BotMapPage() {
  return <div className="bot-map-page space-y-7">
    <PageHeader title="Bot & channel architecture" description="A shared channel gateway design for future interfaces. Each adapter must verify identity and message authenticity before work reaches the Agent engine." />

    <section className="surface-card overflow-hidden p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="eyebrow">Channel fabric / 02</p><h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-100 sm:text-3xl">One intelligence core.<br/><span className="text-[#d8bd83]">Many controlled endpoints.</span></h2><p className="mt-3 max-w-2xl text-sm leading-6 text-stone-400">Bots are interface adapters, not separate AI brains. They inherit the same task lifecycle, registered tools, owner policies and audit trail.</p></div>
        <Link href="/dashboard/bot-channels" className="action-secondary">Open gateway test centre ↗</Link>
      </div>

      <div className="mx-auto mt-8 max-w-4xl">
        <div className="rounded-xl border border-[#a58bb9]/30 bg-[#a58bb9]/[.07] p-5 text-center">
          <p className="eyebrow" style={{color:"#c0add0"}}>Shared intelligence layer</p><h3 className="mt-2 text-lg font-semibold text-stone-100">Futuristic System Agent Engine</h3><p className="mt-2 text-[10px] text-stone-400">Planning · validation · tools · evidence · synthesis</p>
        </div>
        <div className="mx-auto h-9 w-px bg-gradient-to-b from-[#a58bb9] to-[#c2a66b]"/>
        <div className="rounded-xl border border-[#c2a66b]/30 bg-[#c2a66b]/[.07] p-5 text-center">
          <p className="eyebrow">Trust boundary / gateway</p><h3 className="mt-2 text-base font-semibold text-stone-100">Identity · signature · replay protection · routing</h3><p className="mt-2 text-[10px] text-stone-400">Untrusted payloads are normalized and checked before reaching the Agent API.</p>
        </div>
        <div className="mx-auto h-9 w-px bg-[#c2a66b]/60"/>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {channels.map((channel, index) => <article key={channel.name} className="rounded-xl border border-white/[.09] bg-[#1a1b17] p-4">
            <div className="flex items-center justify-between gap-2"><span className="grid h-10 min-w-10 place-items-center rounded-lg border border-white/[.1] bg-white/[.035] px-2 font-mono text-[10px] font-bold text-[#d8bd83]">{channel.code}</span><span className="text-[8px] font-bold uppercase tracking-wide text-stone-500">0{index + 1}</span></div>
            <h3 className="mt-4 text-sm font-semibold text-stone-100">{channel.name}</h3>
            <p className="mt-2 min-h-[54px] text-[10px] leading-5 text-stone-400">{channel.detail}</p>
            <div className="mt-4 border-t border-white/[.07] pt-3"><span className="text-[9px] font-semibold text-[#d8bd83]">{channel.stage}</span></div>
          </article>)}
        </div>
      </div>
    </section>

    <section className="grid gap-3 md:grid-cols-3">
      <div className="metric-card"><span className="metric-label">Channel adapters</span><strong className="metric-value">5</strong><span className="metric-note">Architecture targets shown</span></div>
      <div className="metric-card"><span className="metric-label">Production bots</span><strong className="metric-value">0 verified</strong><span className="metric-note">No live delivery is claimed</span></div>
      <div className="metric-card"><span className="metric-label">Shared engine</span><strong className="metric-value">1</strong><span className="metric-note">Common Agent and policy layer</span></div>
    </section>
    <section className="surface-card flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="eyebrow">Contract validation</p><h3 className="mt-2 text-sm font-semibold text-stone-100">Bot gateway test centre</h3><p className="mt-1 text-xs text-stone-400">Run safe message-envelope, replay and session-isolation checks. These tests do not send real messages.</p></div><Link href="/dashboard/bot-channels" className="action-primary">Open test centre ↗</Link></section>
    <p className="text-[10px] leading-5 text-stone-600">No bot is marked online until credentials, webhook security, owner identity mapping and end-to-end delivery are verified. Messaging providers may require accounts, approvals and fees.</p>
  </div>;
}
