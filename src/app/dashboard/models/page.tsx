import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ModelsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="AI Engine & Providers"
        description="Configure model providers, defaults, and fallback order. API keys stay server-side."
      />
      <div className="mb-4 flex items-center gap-2">
        <StatusBadge status="not_configured" />
        <span className="text-xs text-zinc-500">Provider adapter not connected yet</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Configured providers" description="Add providers after backend integration." />
          <EmptyState title="No providers configured" description="Secrets are never sent to the browser." />
        </Card>
        <Card>
          <CardHeader title="Default & fallback" description="Order used when a primary provider fails." />
          <EmptyState title="Not set" description="Configure after at least one provider is added." />
        </Card>
      </div>
    </div>
  );
}
