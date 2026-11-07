import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Knowledge & Search" description="A provider-neutral research layer planned for web sources, documents and knowledge retrieval." />
      <Card>
        <CardHeader title="Research adapters" description="The interface is reserved for replaceable search providers." />
        <div className="space-y-3 text-sm text-zinc-300">
          <p>Web search provider integration is not enabled yet.</p>
          <p>Next backend stage will add source-aware search results, citations, page extraction and research task execution.</p>
          <p className="text-xs text-zinc-500">No search provider credentials are required until this module is implemented.</p>
        </div>
      </Card>
    </div>
  );
}
