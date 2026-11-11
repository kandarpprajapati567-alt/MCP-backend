const MAX_SYNTHESIS_CONTEXT_CHARS = 9_000;
const MAX_TASK_CHARS = 1_200;
const MAX_PLAN_CHARS = 2_000;
const MAX_RESULT_EXCERPT_CHARS = 1_200;

export interface SynthesisToolResult {
  callId: string;
  toolId: string;
  result: unknown;
}

function safeSerialize(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized : String(value);
  } catch {
    return "[Result could not be serialized]";
  }
}

/**
 * Build a bounded, evidence-preserving context for provider synthesis.
 * Large tool outputs are excerpted instead of causing provider request validation
 * failures. The output is always valid JSON and stays below provider input limits.
 */
export function buildSynthesisUserContent(
  task: string,
  plan: unknown,
  toolResults: SynthesisToolResult[],
): string {
  const planText = safeSerialize(plan);
  const context: {
    task: string;
    taskTruncated: boolean;
    plan: string;
    planTruncated: boolean;
    toolResults: Array<{
      callId: string;
      toolId: string;
      resultExcerpt: string;
      resultTruncated: boolean;
    }>;
    omittedToolResults: number;
  } = {
    task: task.slice(0, MAX_TASK_CHARS),
    taskTruncated: task.length > MAX_TASK_CHARS,
    plan: planText.slice(0, MAX_PLAN_CHARS),
    planTruncated: planText.length > MAX_PLAN_CHARS,
    toolResults: [],
    omittedToolResults: 0,
  };

  for (const item of toolResults) {
    const resultText = safeSerialize(item.result);
    let excerptLength = Math.min(resultText.length, MAX_RESULT_EXCERPT_CHARS);
    let accepted = false;

    while (excerptLength >= 0) {
      context.toolResults.push({
        callId: item.callId,
        toolId: item.toolId,
        resultExcerpt: resultText.slice(0, excerptLength),
        resultTruncated: resultText.length > excerptLength,
      });
      if (JSON.stringify(context).length <= MAX_SYNTHESIS_CONTEXT_CHARS) {
        accepted = true;
        break;
      }
      context.toolResults.pop();
      if (excerptLength === 0) break;
      excerptLength = Math.floor(excerptLength / 2);
    }

    if (!accepted) context.omittedToolResults += 1;
  }

  while (JSON.stringify(context).length > MAX_SYNTHESIS_CONTEXT_CHARS && context.toolResults.length) {
    context.toolResults.pop();
    context.omittedToolResults += 1;
  }

  return JSON.stringify(context);
}
