import { cn } from "@/lib/utils";

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section data-card className={cn("rounded-2xl border border-border bg-surface-raised/80 p-5 shadow-[0_16px_42px_rgba(0,0,0,.14)] backdrop-blur-xl sm:p-6", className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold tracking-wide text-zinc-100">{title}</h3>
        {description && <p className="mt-1.5 max-w-2xl text-xs leading-5 text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}
