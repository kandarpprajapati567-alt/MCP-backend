import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ApiPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="API Management" description="Versioned HTTPS endpoints for the Android app and internal clients." />
      <Card>
        <CardHeader title="Endpoint catalogue" description="OpenAPI contract will be published later." />
        <EmptyState title="API surface pending" description="Health is live at /api/v1/health. Authenticated routes arrive with backend integration." />
      </Card>
    </div>
  );
}
