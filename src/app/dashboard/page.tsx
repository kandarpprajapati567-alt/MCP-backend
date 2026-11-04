import { Card, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

const services = [
  { name: "Database", status: "not_configured" as const, note: "Supabase not connected" },
  { name: "Search provider", status: "not_configured" as const, note: "No API key configured" },
  { name: "MCP server", status: "not_configured" as const, note: "Production path unavailable" },
  { name: "Auth", status: "not_configured" as const, note: "Session layer pending" },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          System overview. Status reflects actual configuration — no fabricated metrics.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {services.map((s) => (
          <Card key={s.name}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-300">{s.name}</p>
              <StatusBadge status={s.status} />
            </div>
            <p className="mt-2 text-xs text-zinc-500">{s.note}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent activity"
            description="Task and audit history will appear here after backend integration."
          />
          <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-zinc-500">
            No activity yet · backend not connected
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Connected devices"
            description="Paired Android sessions will list here."
          />
          <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-zinc-500">
            No devices paired · pairing API not implemented
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Usage"
          description="Request counts and error rates require live telemetry."
        />
        <p className="text-sm text-zinc-500">
          Placeholder only. Metrics will be sourced from server-side usage tables
          once authentication and audit logging are live.
        </p>
      </Card>
    </div>
  );
}
