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

/**
 * Executes planned backend calls in order. A failed call is captured as a
 * result, so it does not prevent later calls from running.
 */
export async function executeToolCallsSequentially<TCall>(
  calls: readonly TCall[],
  execute: (call: TCall) => Promise<unknown>,
): Promise<Array<{ call: TCall; execution: ToolCallExecution }>> {
  const outcomes: Array<{ call: TCall; execution: ToolCallExecution }> = [];
  for (const call of calls) {
    const execution = await executeToolCallSafely(() => execute(call));
    outcomes.push({ call, execution });
  }
  return outcomes;
}
