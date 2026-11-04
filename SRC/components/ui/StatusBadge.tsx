import { cn } from "@/lib/utils";

type Status = "ok" | "not_configured" | "unavailable" | "error" | "degraded";

const styles: Record<Status, string> = {
  ok: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  not_configured: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  unavailable: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
  degraded: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

const labels: Record<Status, string> = {
  ok: "OK",
  not_configured: "Not configured",
  unavailable: "Unavailable",
  error: "Error",
  degraded: "Degraded",
};

export function StatusBadge({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[status],
        className
      )}
    >
      <span
        className={cn(
          "mr-1.5 h-1.5 w-1.5 rounded-full",
          status === "ok" && "bg-emerald-400",
          status === "not_configured" && "bg-zinc-400",
          status === "unavailable" && "bg-amber-400",
          status === "error" && "bg-red-400",
          status === "degraded" && "bg-amber-400"
        )}
      />
      {labels[status]}
    </span>
  );
}
