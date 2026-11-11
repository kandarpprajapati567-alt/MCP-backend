import { safeAgentFailureMessage } from "@/server/agent/failure-diagnostics";

export type ToolCallExecution =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

export async function executeToolCallSafely(
  execute: () => Promise<unknown>,
): Promise<ToolCallExecution> {
  try {
    return { ok: true, result: await execute() };
  } catch (error) {
    return { ok: false, error: safeAgentFailureMessage(error) };
  }
}
