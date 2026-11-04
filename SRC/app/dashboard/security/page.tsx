import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Security & Audit Logs" description="Sessions, device revocation, and audit events. Users cannot insert trusted audit rows." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Sessions & devices" description="Revocation controls." />
          <EmptyState title="No sessions loaded" description="Auth foundation required before session lists appear." />
        </Card>
        <Card>
          <CardHeader title="Audit events" description="Server-written only." />
          <EmptyState title="No audit events" description="Events are written by trusted server code with restricted RLS." />
        </Card>
      </div>
    </div>
  );
}

