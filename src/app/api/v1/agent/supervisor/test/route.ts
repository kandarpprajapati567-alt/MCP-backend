import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { assignSubtasksToAgents, runStageTwoDiagnostics, type AssignableAgent } from "@/server/agent/supervisor-orchestrator";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const results = runStageTwoDiagnostics();
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("agent_definitions")
      .select("id,name,description,role,allowed_tools,enabled")
      .eq("owner_id", PERSONAL_OWNER_ID).eq("enabled", true).limit(100);
    if (error) {
      results.push({ id: "live_agent_registry", status: "failed", detail: "The live Agent registry could not be read." });
    } else {
      const agents: AssignableAgent[] = (data ?? []).map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: typeof agent.description === "string" ? agent.description : "",
        role: typeof agent.role === "string" ? agent.role : "",
        allowedTools: Array.isArray(agent.allowed_tools) ? agent.allowed_tools.filter((item): item is string => typeof item === "string") : [],
        enabled: agent.enabled === true,
      }));
      results.push({
        id: "live_agent_registry",
        status: agents.length > 0 ? "passed" : "failed",
        detail: agents.length > 0
          ? agents.length + " enabled Agent definition(s) loaded from the production database."
          : "No enabled Agent definitions exist. Enable or create at least one Agent before dispatching goals.",
      });
      const assignment = assignSubtasksToAgents([
        { id: "live-research", title: "Research capability probe", objective: "Research sources and official documentation", requiredCapabilities: ["research", "web"] },
        { id: "live-analysis", title: "Analysis capability probe", objective: "Analyze findings and verify evidence", requiredCapabilities: ["analysis"] },
      ], agents);
      const enabledIds = new Set(agents.map((agent) => agent.id));
      const valid = assignment.ok && assignment.assignments.length === 2 &&
        assignment.assignments.every((item) => enabledIds.has(item.agentId));
      results.push({
        id: "live_capability_assignment",
        status: valid ? "passed" : "failed",
        detail: valid
          ? "Live capability matcher assigned both sample workstreams only to enabled production Agents."
          : assignment.ok ? "The live assignment result did not match the enabled Agent registry." : assignment.error,
      });
    }

    const { error: queueError } = await admin.from("agent_tasks")
      .select("id,status").eq("owner_id", PERSONAL_OWNER_ID).limit(1);
    results.push({
      id: "task_queue_storage",
      status: queueError ? "failed" : "passed",
      detail: queueError ? "Agent task queue storage could not be read." : "Agent task queue table is reachable. This check is read-only and does not create a task.",
    });
  } catch {
    results.push({ id: "live_database_checks", status: "failed", detail: "Live Stage 2 database checks could not complete." });
  }
  const passed = results.filter((item) => item.status === "passed").length;
  const failed = results.filter((item) => item.status === "failed").length;
  return NextResponse.json({
    suite: "stage-2-supervisor-planner-assignment",
    status: failed === 0 ? "passed" : "failed",
    summary: { total: results.length, passed, failed },
    results,
    note: "Deterministic production-module and read-only live database checks; no AI credits consumed and no task records created.",
  }, { status: failed === 0 ? 200 : 500, headers: { "Cache-Control": "private, no-store" } });
}
