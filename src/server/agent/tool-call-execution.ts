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
 * Executes planned calls in order. Captured tool failures become per-call
 * outcomes; infrastructure failures and outcome-persistence failures propagate.
 */
export async function executeToolCallsSequentially<TCall>(
  calls: readonly TCall[],
  execute: (call: TCall) => Promise<unknown>,
  shouldCaptureFailure: (call: TCall, error: unknown) => boolean = () => true,
  onOutcome?: (call: TCall, execution: ToolCallExecution) => Promise<void>,
  beforeEach?: (call: TCall) => Promise<void>,
): Promise<Array<{ call: TCall; execution: ToolCallExecution }>> {
  const outcomes: Array<{ call: TCall; execution: ToolCallExecution }> = [];
  for (const call of calls) {
    await beforeEach?.(call);
    let execution: ToolCallExecution;
    try {
      execution = { ok: true, result: await execute(call) };
    } catch (error) {
      if (!shouldCaptureFailure(call, error)) throw error;
      execution = { ok: false, error: safeAgentFailureMessage(error) };
    }
    outcomes.push({ call, execution });
    await onOutcome?.(call, execution);
  }
  return outcomes;
}


/** Executes independent calls concurrently but persists outcomes in plan order. */
export async function executeToolCallsWithConcurrency<TCall>(
  calls: readonly TCall[],
  execute: (call: TCall) => Promise<unknown>,
  maxConcurrency = 3,
  shouldCaptureFailure: (call: TCall, error: unknown) => boolean = () => true,
  onOutcome?: (call: TCall, execution: ToolCallExecution) => Promise<void>,
  beforeEach?: (call: TCall) => Promise<void>,
): Promise<Array<{ call: TCall; execution: ToolCallExecution }>> {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 4) {
    throw new Error("Tool concurrency must be between one and four.");
  }
  const outcomes: Array<{ call: TCall; execution: ToolCallExecution } | undefined> = new Array(calls.length);
  let nextIndex = 0;
  let stopped = false;
  let fatalError: unknown;
  async function worker() {
    while (!stopped) {
      const index = nextIndex++;
      if (index >= calls.length) return;
      const call = calls[index];
      try { await beforeEach?.(call); }
      catch (error) { fatalError ??= error; stopped = true; return; }
      let execution: ToolCallExecution;
      try { execution = { ok: true, result: await execute(call) }; }
      catch (error) {
        if (!shouldCaptureFailure(call, error)) { fatalError ??= error; stopped = true; return; }
        execution = { ok: false, error: safeAgentFailureMessage(error) };
      }
      outcomes[index] = { call, execution };
    }
  }
  await Promise.all(Array.from({ length: Math.min(maxConcurrency, calls.length) }, () => worker()));
  const completed: Array<{ call: TCall; execution: ToolCallExecution }> = [];
  for (const outcome of outcomes) {
    if (!outcome) continue;
    completed.push(outcome);
    await onOutcome?.(outcome.call, outcome.execution);
  }
  if (fatalError !== undefined) throw fatalError;
  return completed;
}
