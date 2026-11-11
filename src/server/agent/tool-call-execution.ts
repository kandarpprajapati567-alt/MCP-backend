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
 * Executes planned calls in order. Only failures selected by shouldCaptureFailure
 * become per-call results; infrastructure failures can still abort the task.
 */
export async function executeToolCallsSequentially<TCall>(
  calls: readonly TCall[],
  execute: (call: TCall) => Promise<unknown>,
  shouldCaptureFailure: (call: TCall, error: unknown) => boolean = () => true,
): Promise<Array<{ call: TCall; execution: ToolCallExecution }>> {
  const outcomes: Array<{ call: TCall; execution: ToolCallExecution }> = [];
  for (const call of calls) {
    let execution: ToolCallExecution;
    try {
      execution = { ok: true, result: await execute(call) };
    } catch (error) {
      if (!shouldCaptureFailure(call, error)) throw error;
      execution = { ok: false, error: safeAgentFailureMessage(error) };
    }
    outcomes.push({ call, execution });
  }
  return outcomes;
}
