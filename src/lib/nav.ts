export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: string;
  group: "Command" | "Intelligence" | "Infrastructure" | "Configuration";
};

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", description: "System pulse, recent activity and quick actions", icon: "grid", group: "Command" },
  { href: "/dashboard/system-map", label: "System topology", description: "Architecture, dependencies and service health", icon: "network", group: "Command" },
  { href: "/dashboard/monitors", label: "Operations room", description: "Task flow, backend health and verified telemetry", icon: "activity", group: "Command" },
  { href: "/dashboard/agent-map", label: "Agent architecture", description: "Specialist roles and observed workload", icon: "cpu", group: "Intelligence" },
  { href: "/dashboard/agents", label: "Agent manager", description: "Create and manage specialist Agents", icon: "users", group: "Intelligence" },
  { href: "/dashboard/agent-lab", label: "Agent workbench", description: "Run tasks and inspect execution traces", icon: "flask", group: "Intelligence" },
  { href: "/dashboard/models", label: "Model routing", description: "Providers and workflow routing", icon: "layers", group: "Intelligence" },
  { href: "/dashboard/bot-map", label: "Bot architecture", description: "Channel topology and shared gateway", icon: "orbit", group: "Intelligence" },
  { href: "/dashboard/bot-channels", label: "Channel gateway", description: "Adapters, identity and contract tests", icon: "message", group: "Intelligence" },
  { href: "/dashboard/connections", label: "Integrations", description: "GitHub, web search and MCP services", icon: "plug", group: "Infrastructure" },
  { href: "/dashboard/mcp", label: "Tools & MCP", description: "Protocol endpoint and tool catalogue", icon: "terminal", group: "Infrastructure" },
  { href: "/dashboard/database", label: "Memory & devices", description: "Persistent memory and paired clients", icon: "database", group: "Infrastructure" },
  { href: "/dashboard/search", label: "Research", description: "Search integration status", icon: "search", group: "Infrastructure" },
  { href: "/dashboard/api", label: "API reference", description: "Credentials and API endpoints", icon: "code", group: "Configuration" },
  { href: "/dashboard/settings", label: "System settings", description: "Runtime configuration and security", icon: "settings", group: "Configuration" },
];
