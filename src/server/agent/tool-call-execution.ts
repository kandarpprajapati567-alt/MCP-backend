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

type ParallelBatchOutcome<TCall> =
  | { call: TCall; kind: "execution"; execution: ToolCallExecution }
  | { call: TCall; kind: "fatal"; error: unknown };

/**
 * Runs only explicitly classified independent/read-only calls concurrently.
 * Side-effecting and unknown calls remain sequential. A batch is bounded,
 * results are persisted in plan order, and infrastructure/persistence errors
 * remain fatal instead of being disguised as tool failures.
 */
export async function executeToolCallsWithBoundedParallelism<TCall>(
  calls: readonly TCall[],
  execute: (call: TCall) => Promise<unknown>,
  options: {
    maxConcurrency?: number;
    canRunInParallel: (call: TCall) => boolean;
    shouldCaptureFailure?: (call: TCall, error: unknown) => boolean;
    onOutcome?: (call: TCall, execution: ToolCallExecution) => Promise<void>;
    beforeEach?: (call: TCall) => Promise<void>;
  },
): Promise<Array<{ call: TCall; execution: ToolCallExecution }>> {
  const maxConcurrency = options.maxConcurrency ?? 3;
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 4) {
    throw new Error("Agent parallelism must be between 1 and 4.");
  }

  const outcomes: Array<{ call: TCall; execution: ToolCallExecution }> = [];
  let index = 0;

  while (index < calls.length) {
    const call = calls[index];
    if (!options.canRunInParallel(call) || maxConcurrency === 1) {
      await options.beforeEach?.(call);
      let execution: ToolCallExecution;
      try {
        execution = { ok: true, result: await execute(call) };
      } catch (error) {
        if (!(options.shouldCaptureFailure ?? (() => true))(call, error)) throw error;
        execution = { ok: false, error: safeAgentFailureMessage(error) };
      }
      outcomes.push({ call, execution });
      await options.onOutcome?.(call, execution);
      index += 1;
      continue;
    }

    const batch: TCall[] = [];
    while (index < calls.length && batch.length < maxConcurrency && options.canRunInParallel(calls[index])) {
      batch.push(calls[index]);
      index += 1;
    }

    // Check cancellation for the whole batch before launching any work.
    for (const batchCall of batch) await options.beforeEach?.(batchCall);

    const settled: ParallelBatchOutcome<TCall>[] = await Promise.all(batch.map(async (batchCall) => {
      try {
        return { call: batchCall, kind: "execution", execution: { ok: true, result: await execute(batchCall) } };
      } catch (error) {
        if (!(options.shouldCaptureFailure ?? (() => true))(batchCall, error)) {
          return { call: batchCall, kind: "fatal", error };
        }
        return { call: batchCall, kind: "execution", execution: { ok: false, error: safeAgentFailureMessage(error) } };
      }
    }));

    for (const item of settled) {
      if (item.kind === "fatal") throw item.error;
      const execution = item.execution;
      outcomes.push({ call: item.call, execution });
      await options.onOutcome?.(item.call, execution);
    }
  }

  return outcomes;
}
