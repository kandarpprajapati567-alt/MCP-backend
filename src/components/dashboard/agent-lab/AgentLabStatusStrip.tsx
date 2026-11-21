type Props = {
  connected: boolean;
  agentName: string;
  provider: string;
  lastStatus: string;
  costMode: string;
};

export function AgentLabStatusStrip({ connected, agentName, provider, lastStatus, costMode }: Props) {
  const cells = [
    { label: "Connection", value: connected ? "Secure session" : "Disconnected", tone: connected ? "text-emerald-300" : "text-amber-300" },
    { label: "Selected agent", value: agentName || "Not selected", tone: "text-zinc-100" },
    { label: "Provider", value: provider || "—", tone: provider === "mock" ? "text-emerald-300" : "text-sky-300" },
    { label: "Last run", value: lastStatus || "No runs yet", tone: lastStatus === "failed" ? "text-rose-300" : "text-zinc-100" },
    { label: "Cost mode", value: costMode, tone: costMode === "Mock · no paid inference" ? "text-emerald-300" : "text-amber-200" },
  ];
  return (
    <section aria-label="Agent Lab status" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-5">
      {cells.map((cell) => <div key={cell.label} className="min-w-0 bg-zinc-950/90 px-3 py-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{cell.label}</p>
        <p className={"mt-1 truncate text-xs font-semibold " + cell.tone} title={cell.value}>{cell.value}</p>
      </div>)}
    </section>
  );
}
