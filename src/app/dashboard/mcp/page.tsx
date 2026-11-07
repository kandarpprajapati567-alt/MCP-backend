import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";

const tools = [
  { name: "text.word_count", detail: "Count words in a supplied text block." },
  { name: "text.extract_keywords", detail: "Extract frequent meaningful keywords." },
  { name: "text.text_stats", detail: "Return character, word and sentence statistics." },
];

export default function McpPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="MCP Server & Tools"
        description="Standard Model Context Protocol endpoint for Futuristic System and future connected clients."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-zinc-950/70 p-4">
          <p className="text-xs text-zinc-500">Transport</p>
          <p className="mt-2 text-sm font-semibold text-emerald-300">Streamable HTTP</p>
        </div>
        <div className="rounded-xl border border-border bg-zinc-950/70 p-4">
          <p className="text-xs text-zinc-500">Endpoint</p>
          <p className="mt-2 break-all text-sm font-semibold text-white">/api/mcp</p>
        </div>
        <div className="rounded-xl border border-border bg-zinc-950/70 p-4">
          <p className="text-xs text-zinc-500">Mode</p>
          <p className="mt-2 text-sm font-semibold text-white">Stateless · JSON response</p>
        </div>
      </div>
      <Card>
        <CardHeader title="Connection contract" description="Use this endpoint when the Android MCP client is ready." />
        <div className="space-y-3 text-sm text-zinc-300">
          <p><span className="text-zinc-500">URL:</span> https://mcp-backend-2oyj.onrender.com/api/mcp</p>
          <p><span className="text-zinc-500">Authorization:</span> Bearer owner master token</p>
          <p><span className="text-zinc-500">Content-Type:</span> application/json</p>
          <p><span className="text-zinc-500">Accept:</span> application/json, text/event-stream</p>
          <p><span className="text-zinc-500">Protocol header:</span> MCP-Protocol-Version: 2026-07-28 after initialize</p>
          <p className="text-xs text-zinc-500">The server does not create an expiring four-day session. The owner master token is verified per request and must remain server-controlled.</p>
        </div>
      </Card>
      <Card>
        <CardHeader title="Registered tools" description="Read-only and bounded tools currently available over MCP." />
        <div className="space-y-2">
          {tools.map((tool) => (
            <div key={tool.name} className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-cyan-200">{tool.name}</p>
              <p className="mt-1 text-xs text-zinc-400">{tool.detail}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Protocol capabilities" description="Available methods." />
        <div className="grid gap-2 sm:grid-cols-2">
          {["initialize / ping", "tools/list / tools/call", "resources/list / resources/read", "prompts/list / prompts/get"].map((item) => (
            <div key={item} className="rounded-lg border border-border px-3 py-2 text-xs text-zinc-300">{item}</div>
          ))}
        </div>
      </Card>
    </div>
  );
}
