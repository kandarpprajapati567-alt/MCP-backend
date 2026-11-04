import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Search Configuration" description="Provider-neutral web search. Keys remain on the server." />
      <div className="mb-4"><StatusBadge status="not_configured" /></div>
      <Card>
        <CardHeader title="Search provider" description="Adapter interface supports swappable backends." />
        <EmptyState title="Search provider not configured" description="Add a server-side API key to enable. Until then the API returns unconfigured status." />
      </Card>
    </div>
  );
}
