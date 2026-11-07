export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: string;
};

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", description: "Backend command centre", icon: "grid" },
  { href: "/dashboard/models", label: "AI Engine", description: "Models and providers", icon: "cpu" },
  { href: "/dashboard/api", label: "API Management", description: "Endpoints and contracts", icon: "code" },
  { href: "/dashboard/database", label: "Database & Memory", description: "Persistent data layer", icon: "database" },
  { href: "/dashboard/search", label: "Knowledge & Search", description: "Research capabilities", icon: "search" },
  { href: "/dashboard/mcp", label: "MCP & Tools", description: "Tool registry and servers", icon: "plug" },
  { href: "/dashboard/settings", label: "Settings", description: "Backend configuration", icon: "settings" },
];
