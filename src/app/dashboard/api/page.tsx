import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";

const endpoints = [
  { method: "GET / POST / DELETE", path: "/api/v1/session", description: "Exchange the owner key for a short-lived HttpOnly browser session, inspect session status or revoke the session." },
  { method: "POST", path: "/api/mcp", description: "MCP Streamable HTTP JSON-RPC endpoint." },
  { method: "GET", path: "/api/v1/health", description: "Public backend and database health." },
  { method: "GET / POST", path: "/api/v1/agent/tasks", description: "Create agent tasks and read execution history." },
  { method: "GET", path: "/api/v1/agent/tasks/:taskId", description: "Read a task, event timeline and remote device jobs." },
  { method: "GET / PUT / DELETE", path: "/api/v1/ai/policies", description: "Configure provider and model routing per workflow." },
  { method: "GET / POST / DELETE", path: "/api/v1/memory", description: "Search, store and delete persistent memory." },
  { method: "GET / POST / PUT / DELETE", path: "/api/v1/devices", description: "Owner device management; PUT refreshes the authenticated device manifest." },
  { method: "POST", path: "/api/v1/devices/pairing", description: "Owner-only: create a five-minute single-use pairing code." },
  { method: "POST", path: "/api/v1/devices/pairing/claim", description: "Exchange a pairing code for a one-time device-scoped bearer token." },
  { method: "POST", path: "/api/v1/devices/jobs", description: "Queue a validated tool request for a connected device." },
  { method: "POST", path: "/api/v1/devices/jobs/claim", description: "Device-token authenticated polling and atomic job claiming." },
  { method: "POST", path: "/api/v1/devices/jobs/result", description: "Device-token authenticated result callback." },
  { method: "GET / PUT / DELETE", path: "/api/v1/ai/providers/keys", description: "Manage encrypted provider credentials." },
  { method: "POST", path: "/api/v1/ai/generate", description: "Run a provider-routed generation workflow." },
];

export default function ApiPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="API Management" description="Versioned HTTPS API surface for Futuristic System and future connected clients." />
      <Card>
        <CardHeader title="Live API catalogue" description="Owner APIs accept the master token or a signed short-lived HttpOnly browser session; paired-device endpoints use revocable device-scoped tokens. Health is public." />
        <div className="space-y-2">
          {endpoints.map((item) => (
            <div key={item.path} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[150px_1fr]">
              <div><span className="rounded-md bg-cyan-400/10 px-2 py-1 font-mono text-[10px] text-cyan-200">{item.method}</span></div>
              <div><p className="break-all font-mono text-xs text-white">{item.path}</p><p className="mt-1 text-xs text-zinc-500">{item.description}</p></div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Connection base URL" description="Render production service." />
        <p className="break-all font-mono text-sm text-cyan-200">https://mcp-backend-2oyj.onrender.com</p>
      </Card>
    </div>
  );
}
