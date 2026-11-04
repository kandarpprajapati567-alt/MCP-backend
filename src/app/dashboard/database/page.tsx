import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";

export default function DatabasePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Database & Users" description="PostgreSQL via Supabase. RLS and ownership enforced server-side." />
      <div className="mb-4"><StatusBadge status="not_configured" /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Connection" description="Supabase project link." />
          <EmptyState title="Database not configured" description="Set NEXT_PUBLIC_SUPABASE_URL and server credentials, then run migrations." />
        </Card>
        <Card>
          <CardHeader title="Users & profiles" description="Auth-linked records." />
          <EmptyState title="No users loaded" description="Profiles appear after auth foundation is enabled." />
        </Card>
      </div>
    </div>
  );
}
