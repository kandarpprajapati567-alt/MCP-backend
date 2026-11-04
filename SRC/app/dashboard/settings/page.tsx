import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Settings" description="Account and platform preferences. Requires authenticated session." />
      <Card>
        <CardHeader title="Account" description="Profile and preferences." />
        <EmptyState title="Sign-in required" description="Authentication foundation is part of the next backend phase." />
      </Card>
    </div>
  );
}
