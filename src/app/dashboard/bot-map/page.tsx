import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";

const channels = [
  { name: "Website", stage: "Planned", detail: "Authenticated chat interface and streaming task updates are not connected.", tone: "text-slate-300", code: "WEB" },
  { name: "Telegram", stage: "Contract foundation", detail: "Message envelope and contract checks exist; webhook signature verification and identity linking remain gated.", tone: "text-amber-200", code: "TG" },
  { name: "Discord", stage: "Planned", detail: "Interaction signature verification, identity linking and delivery are not connected.", tone: "text-slate-300", code: "DC" },
  { name: "WhatsApp", stage: "Planned", detail: "Business account, opt-in, webhook verification and possible messaging charges are required.", tone: "text-slate-300", code: "WA" },
  { name: "Android Client", stage: "Separate device bridge", detail: "Local Android permissions and device-side execution remain controlled by the app.", tone: "text-sky-200", code: "AND" },
];

export default function BotMapPage() {
  return <div className="mx-auto max-w-[1440px] space-y-6">
    <PageHeader title="Bot Network Map" description="A separate channel topology for future bots and clients. All channels are designed to use the same secured Agent Engine."/>
    <section className="overflow-hidden rounded-2xl border border-amber-200/15 bg-[radial-gradient(ellipse_at_50%_0%,rgba(245,158,11,.12),transparent_60%),linear-gradient(145deg,#17130e,#0b111b)] p-5 sm:p-7">
      <p className="text-[9px] font-bold tracking-[.22em] text-amber-200">CHANNEL FABRIC / 02</p><h2 className="mt-2 text-2xl font-semibold text-white">One brain. Multiple controlled endpoints.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Bot adapters carry identity and messages. They do not create their own permission system or bypass backend Agent policies.</p>
      <div className="mx-auto mt-7 max-w-lg rounded-xl border border-violet-300/25 bg-violet-300/[.08] p-4 text-center"><span className="text-[9px] font-bold tracking-[.18em] text-violet-200">SHARED INTELLIGENCE</span><strong className="mt-1 block text-lg text-white">Futuristic System Agent Engine</strong><p className="mt-1 text-[10px] text-slate-400">Owner auth · policy · task lifecycle · evidence</p></div>
      <div className="mx-auto h-8 w-px bg-gradient-to-b from-violet-300/70 to-amber-200/50"/>
      <div className="mx-auto max-w-3xl rounded-xl border border-amber-200/25 bg-amber-200/[.06] p-4 text-center"><span className="text-[9px] font-bold tracking-[.18em] text-amber-100">CHANNEL GATEWAY</span><strong className="mt-1 block text-base text-white">Identity · signature · replay protection · routing</strong><p className="mt-1 text-[10px] text-slate-400">Untrusted channel payloads are normalized before reaching the Agent API</p></div>
      <div className="mx-auto h-8 w-px bg-amber-200/50"/>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{channels.map((channel) => <div key={channel.name} className="relative rounded-xl border border-white/10 bg-[#111a27] p-4"><div className="mb-4 flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-lg border border-amber-200/20 bg-amber-200/[.07] text-[10px] font-black text-amber-100">{channel.code}</span><span className={"text-[9px] font-bold " + channel.tone}>{channel.stage}</span></div><h3 className="text-sm font-semibold text-white">{channel.name}</h3><p className="mt-2 text-[10px] leading-5 text-slate-400">{channel.detail}</p></div>)}</div>
    </section>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#0b121e] p-5"><div><h3 className="text-sm font-semibold text-white">Bot contract test centre</h3><p className="mt-1 text-xs text-slate-500">Run safe message-envelope, replay and isolation checks. These do not send real messages.</p></div><Link href="/dashboard/bot-channels" className="rounded-xl border border-amber-200/25 bg-amber-200/[.08] px-4 py-3 text-xs font-semibold text-amber-100">Open Bot Test Centre ↗</Link></section>
    <p className="text-[10px] text-slate-500">No bot is marked online until its credentials, webhook security, owner identity mapping and end-to-end delivery have been verified.</p>
  </div>;
}
