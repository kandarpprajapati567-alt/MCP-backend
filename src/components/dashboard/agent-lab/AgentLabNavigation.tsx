"use client";

const items = [
  { id: "run", label: "Run", hint: "Single agent" },
  { id: "team", label: "Team", hint: "2–3 agents" },
  { id: "test-center", label: "Test Center", hint: "Deterministic checks" },
  { id: "history", label: "History & Trace", hint: "Tasks and evidence" },
];

export function AgentLabNavigation() {
  return (
    <nav aria-label="Agent Lab sections" className="sticky top-2 z-20 flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-1.5 shadow-xl backdrop-blur">
      {items.map((item) => (
        <a key={item.id} href={"#" + item.id} className="group min-w-max rounded-xl px-3 py-2.5 text-xs text-zinc-300 transition hover:bg-cyan-400/10 hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
          <span className="block font-semibold">{item.label}</span>
          <span className="mt-0.5 hidden text-[10px] text-zinc-500 sm:block">{item.hint}</span>
        </a>
      ))}
    </nav>
  );
}
