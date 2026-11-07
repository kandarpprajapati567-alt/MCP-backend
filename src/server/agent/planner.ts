import "server-only";

import { executeUserWorkflow } from "../ai/routing/runtime-executor";
import { TOOL_CATALOG } from "../tools/registry";
import { parseAgentPlan, type AgentPlan } from "./plan-schema";

const PROMPT = [
  "You are the planning stage of a personal AI agent. Return JSON only with exactly this shape:",
  '{"version":1,"goal":"...","steps":[{"id":"step-1","objective":"...","expectedOutcome":"..."}],"toolCalls":[{"id":"call-1","toolId":"text.word_count","arguments":{"text":"..."}}]}',
  "Use 1–8 steps and at most 4 tool calls. toolCalls may be empty.",
  "Only use a tool when directly useful. Never claim that a tool has run.",
  "Tool arguments must follow the registered input schema and use only information supplied in the task.",
  "Available tools:",
  ...TOOL_CATALOG.map((tool) => tool.id + ": " + tool.description),
  "No shell, arbitrary code, unrestricted network, or filesystem access is available.",
].join("\n");

export async function createAgentPlan(userId: string, task: string): Promise<AgentPlan | null> {
  if (typeof task !== "string" || task.trim().length < 1 || task.length > 4000) {
    throw new Error("Task must be between 1 and 4000 characters.");
  }

  const execution = await executeUserWorkflow(userId, "planner", {
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: task.trim() },
    ],
    temperature: 0.1,
    maxOutputTokens: 1600,
  });

  if (execution.route.providerId === "mock") return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(execution.result.text);
  } catch {
    throw new Error("Planner returned invalid JSON.");
  }
  const parsed = parseAgentPlan(decoded);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}
