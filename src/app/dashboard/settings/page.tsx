import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";

const variables = [
  { name: "FS_OWNER_TOKEN", purpose: "Private owner API access" },
  { name: "SUPABASE_SECRET_KEY", purpose: "Server-only database access" },
  { name: "AI_PROVIDER_ENCRYPTION_KEY", purpose: "Encrypt provider credentials" },
  { name: "NEXT_PUBLIC_SUPABASE_URL", purpose: "Supabase project URL" },
  { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", purpose: "Public Supabase client key" },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Backend Settings" description="Personal single-owner configuration. No signup or account login is required." />
      <Card>
        <CardHeader title="Runtime configuration" description="Set these values in Render Environment. Secret values are never displayed in this dashboard." />
        <div className="space-y-2">
          {variables.map((item) => (
            <div key={item.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-3">
              <div><p className="font-mono text-xs text-cyan-200">{item.name}</p><p className="mt-1 text-xs text-zinc-500">{item.purpose}</p></div>
              <span className="text-[10px] text-zinc-500">Render environment</span>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader title="AI provider setup" description="Configure encrypted provider keys and workflow model selection." />
          <Link href="/dashboard/models" className="text-sm text-cyan-300">Open AI routing →</Link>
        </Card>
        <Card>
          <CardHeader title="MCP client connection" description="Endpoint and protocol details for future Android integration." />
          <Link href="/dashboard/mcp" className="text-sm text-cyan-300">Open MCP server →</Link>
        </Card>
      </div>
    </div>
  );
}
