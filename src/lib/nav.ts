export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: string;
};

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", description: "Live system status and activity", icon: "grid" },
  { href: "/dashboard/system-map", label: "System Map", description: "Architecture, dependencies and service health", icon: "plug" },
  { href: "/dashboard/agent-map", label: "Agentic Map", description: "Specialist Agent topology and workload", icon: "cpu" },
  { href: "/dashboard/bot-map", label: "Bot Network", description: "Bot channels and gateway topology", icon: "message-circle" },
  { href: "/dashboard/monitors", label: "AI Monitors", description: "Task flow, health and AI capability telemetry", icon: "activity" },
  { href: "/dashboard/agents", label: "Agent Manager", description: "Create and manage specialist agents", icon: "cpu" },
  { href: "/dashboard/agent-lab", label: "Agent Lab", description: "Run tasks and inspect execution traces", icon: "shield" },
  { href: "/dashboard/bot-channels", label: "Bot Gateway", description: "Channel adapters, identity and contract tests", icon: "message-circle" },
  { href: "/dashboard/connections", label: "Connections", description: "Connect GitHub, web search and MCP services", icon: "plug" },
  { href: "/dashboard/models", label: "AI Engine", description: "Providers and workflow routing", icon: "cpu" },
  { href: "/dashboard/api", label: "API Management", description: "Credentials and API endpoints", icon: "code" },
  { href: "/dashboard/database", label: "Memory & Devices", description: "Persistent memory and paired clients", icon: "database" },
  { href: "/dashboard/search", label: "Research", description: "Search integration status", icon: "search" },
  { href: "/dashboard/mcp", label: "MCP & Tools", description: "Protocol endpoint and tool catalog", icon: "plug" },
  { href: "/dashboard/settings", label: "Settings", description: "Runtime configuration and security", icon: "settings" },
];
