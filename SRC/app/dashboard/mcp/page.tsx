import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";

export default function McpPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="MCP & Connected Tools"
        description="Custom MCP server over Streamable HTTP. Production remains unavailable until real token verification is implemented."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status="not_configured" />
        <span className="text-xs text-zinc-500">Dev token only under explicit local configuration · never in production</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Server status" description="Transport: Streamable HTTP" />
          <EmptyState title="MCP not available" description="Endpoint stays offline in production until secure verification is ready." />
        </Card>
        <Card>
          <CardHeader title="Registered tools" description="Read-only tools in Stage B" />
          <EmptyState title="No tools registered" description="get_system_status and others will appear after MCP phase." />
        </Card>
      </div>
    </div>
  );
}
