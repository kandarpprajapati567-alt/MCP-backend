import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Knowledge & Search" description="Source-aware web research powered by the connected search provider." />
      <Card>
        <CardHeader title="Web Search tool" description="Agents can now search the public web through the shared tool registry and MCP endpoint." />
        <div className="space-y-3 text-sm text-zinc-300">
          <p>Connect a Tavily API key in the Connections Hub to enable the <code>web.search</code> tool.</p>
          <p>Search responses include source titles, URLs, excerpts and relevance scores. Agents can cite returned source URLs in their task results.</p>
          <Link href="/dashboard/connections" className="inline-flex rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950">Open Connections Hub</Link>
        </div>
      </Card>
    </div>
  );
}
