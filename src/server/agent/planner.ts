import "server-only";

import { executeAgentWorkflow, executeUserWorkflow } from "../ai/routing/runtime-executor";
import type { AgentDefinitionInput } from "./definition-schema";
import type { AIGenerationRequest } from "../ai/providers/types";
import { TOOL_CATALOG } from "../tools/registry";
import { parseAgentPlan, type AgentAvailableTool, type AgentPlan } from "./plan-schema";
import { buildPlannerSystemPrompt } from "./prompt-context";
import { evaluateAgentToolPolicy } from "./tool-policy";

export type AvailableDeviceTool = AgentAvailableTool & {
  deviceId: string;
  permission: string;
  sideEffect: boolean;
};

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
    ...TOOL_CATALOG.map((tool) => ({
      id: tool.id, inputSchema: tool.inputSchema, description: tool.description,
      permission: tool.permission, sideEffect: tool.sideEffect, target: "backend" as const,
    })),
    ...remoteTools.map((tool) => ({
      id: tool.id, inputSchema: tool.inputSchema, description: tool.description,
      permission: tool.permission, sideEffect: tool.sideEffect, target: "remote_mcp" as const,
    })),
  ];
  const backendTools: AgentAvailableTool[] = registeredTools
    .filter((tool) => tool.id !== "device.dispatch_tool" && !tool.id.startsWith("agent.") &&
      evaluateAgentToolPolicy(tool, agent?.allowedTools ?? null).allowed)
    .map(({ id, inputSchema, description }) => ({ id, inputSchema, description }));
  const permittedDeviceTools = agent
    ? deviceTools.filter((tool) => evaluateAgentToolPolicy({
        id: tool.id, permission: tool.permission, sideEffect: tool.sideEffect, target: "device",
      }, agent.allowedTools).allowed)
    : [];
  const availableTools = [...backendTools, ...permittedDeviceTools.slice(0, 8)];
  const prompt = buildPlannerSystemPrompt(availableTools, agent);

  const request: AIGenerationRequest = {
    messages: [
      { role: "system", content: prompt },
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
    throw new Error("Planner returned invalid JSON.");
  }
  const parsed = parseAgentPlan(decoded, availableTools, {
    maxSteps: agent?.maxSteps,
    maxToolCalls: agent?.maxToolCalls,
  });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}
