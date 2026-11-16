import "server-only";

import { executeAgentWorkflow, executeUserWorkflow } from "../ai/routing/runtime-executor";
import type { AgentDefinitionInput } from "./definition-schema";
import type { AIGenerationRequest } from "../ai/providers/types";
import { TOOL_CATALOG } from "../tools/registry";
import { parseAgentPlan, type AgentAvailableTool, type AgentPlan } from "./plan-schema";
import { buildPlannerSystemPrompt } from "./prompt-context";

export type AvailableDeviceTool = AgentAvailableTool & {
  deviceId: string;
  permission: string;
  sideEffect: boolean;
};

const MAX_PLANNING_ATTEMPTS = 2;

export async function createAgentPlan(
  userId: string,
  task: string,
  deviceTools: readonly AvailableDeviceTool[] = [],
  agent?: AgentDefinitionInput,
): Promise<AgentPlan | null> {
  if (typeof task !== "string" || task.trim().length < 1 || task.length > 4000) {
    throw new Error("Task must be between 1 and 4000 characters.");
  }

  const { listRemoteAgentToolsSafe } = await import("../mcp/remote");
  const remoteTools = await listRemoteAgentToolsSafe();
  const registeredTools = [
    ...TOOL_CATALOG.map((tool) => ({ id: tool.id, inputSchema: tool.inputSchema, description: tool.description })),
    ...remoteTools.map((tool) => ({ id: tool.id, inputSchema: tool.inputSchema, description: tool.description })),
  ];
  const backendTools: AgentAvailableTool[] = registeredTools
    .filter((tool) => tool.id !== "device.dispatch_tool" && !tool.id.startsWith("agent.") &&
      (!agent || agent.allowedTools.includes(tool.id)));
  const permittedDeviceTools = agent
    ? deviceTools.filter((tool) => agent.allowedTools.includes(tool.id))
    : deviceTools;
  const availableTools = [...backendTools, ...permittedDeviceTools.slice(0, 8)];

  let repairFeedback: string | undefined;
  let lastValidationError = "Planner did not return a valid plan.";

  for (let attempt = 0; attempt < MAX_PLANNING_ATTEMPTS; attempt += 1) {
    const request: AIGenerationRequest = {
      messages: [
        { role: "system", content: buildPlannerSystemPrompt(availableTools, agent, repairFeedback) },
        { role: "user", content: task.trim() },
      ],
      temperature: 0.1,
      maxOutputTokens: 2400,
    };
    const execution = agent
      ? await executeAgentWorkflow(userId, "planner", request, {
          providerPreference: agent.providerPreference,
          modelPreference: agent.modelPreference,
        })
      : await executeUserWorkflow(userId, "planner", request);

    if (execution.route.providerId === "mock") return null;

    let decoded: unknown;
    try {
      decoded = JSON.parse(execution.result.text);
    } catch {
      lastValidationError = "Planner response was not valid JSON.";
      repairFeedback = lastValidationError;
      continue;
    }

    const parsed = parseAgentPlan(decoded, availableTools, {
      maxSteps: agent?.maxSteps,
      maxToolCalls: agent?.maxToolCalls,
    });
    if (parsed.ok) return parsed.value;

    lastValidationError = parsed.error;
    repairFeedback = parsed.error;
  }

  throw new Error("Planner could not produce a schema-valid plan after " +
    MAX_PLANNING_ATTEMPTS + " attempts: " + lastValidationError);
}
