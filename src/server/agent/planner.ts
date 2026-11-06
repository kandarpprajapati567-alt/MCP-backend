import "server-only";

import type { AIProvider } from "../ai/providers/types";
import { parseAgentPlan, type AgentPlan } from "./plan-schema";

const PLANNER_SYSTEM_PROMPT = [
  "You are a task planner. Convert the user's task into a safe, concise plan.",
  "Return JSON only, with exactly this shape:",
  '{"version":1,"goal":"...","steps":[{"id":"step-1","objective":"...","expectedOutcome":"..."}]}',
  "Use 1 to 8 steps. IDs must be unique and sequential from step-1.",
  "Do not invent tools, claim actions were executed, request secrets, or include executable code.",
  "Planning only: no tools are available and no side effects may be performed.",
].join("\n");

export async function createAgentPlan(provider: AIProvider, task: string): Promise<AgentPlan> {
  if (typeof task !== "string" || task.trim().length < 1 || task.length > 4000) {
    throw new Error("Task must be between 1 and 4000 characters.");
  }

  const result = await provider.generate({
    messages: [
      { role: "system", content: PLANNER_SYSTEM_PROMPT },
      { role: "user", content: task.trim() },
    ],
    temperature: 0.1,
    maxOutputTokens: 1200,
  });

  let decoded: unknown;
  try {
    decoded = JSON.parse(result.text);
  } catch {
    throw new Error("Planner returned invalid JSON.");
  }

  const parsed = parseAgentPlan(decoded);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}
