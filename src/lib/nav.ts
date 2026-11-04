export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: string;
};

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", description: "System overview", icon: "grid" },
  { href: "/dashboard/models", label: "AI Engine & Providers", description: "Models and providers", icon: "cpu" },
  { href: "/dashboard/api", label: "API Management", description: "Keys and endpoints", icon: "code" },
  { href: "/dashboard/database", label: "Database & Users", description: "Data and accounts", icon: "database" },
  { href: "/dashboard/search", label: "Search Configuration", description: "Web search providers", icon: "search" },
  { href: "/dashboard/mcp", label: "MCP & Tools", description: "Connected tools", icon: "plug" },
  { href: "/dashboard/security", label: "Security & Audit", description: "Logs and access", icon: "shield" },
  { href: "/dashboard/settings", label: "Settings", description: "Account preferences", icon: "settings" },
];
