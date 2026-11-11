export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: string;
};

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", description: "Live system status and activity", icon: "grid" },
  { href: "/dashboard/agents", label: "Agent Manager", description: "Create and manage specialist agents", icon: "cpu" },
  { href: "/dashboard/bots", label: "Bot Manager", description: "Create user-facing Bots and delegate to Agents", icon: "bot" },
  { href: "/dashboard/models", label: "AI Engine", description: "Providers and workflow routing", icon: "cpu" },
  { href: "/dashboard/api", label: "API Management", description: "Credentials and API endpoints", icon: "code" },
  { href: "/dashboard/database", label: "Memory & Devices", description: "Persistent memory and paired clients", icon: "database" },
  { href: "/dashboard/search", label: "Research", description: "Search integration status", icon: "search" },
  { href: "/dashboard/mcp", label: "MCP & Tools", description: "Protocol endpoint and tool catalog", icon: "plug" },
  { href: "/dashboard/settings", label: "Settings", description: "Runtime configuration and security", icon: "settings" },
];
