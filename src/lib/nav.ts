export type NavGroup = "Command" | "Intelligence" | "Automation" | "Connected Systems" | "Configuration";
export type NavItem = { href:string; label:string; description:string; icon:string; group:NavGroup };
export const navGroups:NavGroup[]=["Command","Intelligence","Automation","Connected Systems","Configuration"];
export const navItems:NavItem[]=[
{href:"/dashboard",label:"Live system map",description:"Cinematic system topology and live connection view",icon:"grid",group:"Command"},
{href:"/dashboard/command",label:"Command console",description:"Submit Agent tasks and manage owner operations",icon:"terminal",group:"Command"},
{href:"/dashboard/monitors",label:"Operations room",description:"Backend health, task activity and verified telemetry",icon:"activity",group:"Command"},
{href:"/dashboard/system-map",label:"System topology",description:"Detailed architecture and service dependencies",icon:"network",group:"Command"},
{href:"/dashboard/agent-map",label:"Agent architecture",description:"Specialist roles and observed workload",icon:"cpu",group:"Intelligence"},
{href:"/dashboard/agents",label:"Agent manager",description:"Create and manage specialist Agents",icon:"users",group:"Intelligence"},
{href:"/dashboard/agent-lab",label:"Agent workbench",description:"Run tasks, inspect plans, events and tests",icon:"flask",group:"Intelligence"},
{href:"/dashboard/models",label:"AI models & routing",description:"Provider adapters and workflow routing",icon:"layers",group:"Intelligence"},
{href:"/dashboard/bot-map",label:"Bot architecture",description:"Bot network and channel topology",icon:"orbit",group:"Intelligence"},
{href:"/dashboard/bot-channels",label:"Channel gateway",description:"Channel contracts and connection tests",icon:"message",group:"Intelligence"},
{href:"/dashboard/mcp",label:"Tools & MCP",description:"Protocol endpoint and tool catalogue",icon:"terminal",group:"Automation"},
{href:"/dashboard/connections",label:"Integrations",description:"Web search and remote MCP services",icon:"plug",group:"Automation"},
{href:"/dashboard/search",label:"Research",description:"Search integration and source results",icon:"search",group:"Automation"},
{href:"/dashboard/database",label:"Memory & devices",description:"Persistent memory and paired Android clients",icon:"database",group:"Connected Systems"},
{href:"/dashboard/api",label:"API reference",description:"Owner and device API contracts",icon:"code",group:"Configuration"},
{href:"/dashboard/settings",label:"System settings",description:"Runtime configuration and security",icon:"settings",group:"Configuration"}
];
