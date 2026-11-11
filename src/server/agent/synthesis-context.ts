const MAX_SYNTHESIS_CONTEXT_CHARS = 3_500;
const MAX_TASK_CHARS = 900;
const MAX_PLAN_CHARS = 500;
const MAX_RESULT_EXCERPT_CHARS = 1_100;
const MAX_AGENT_INSTRUCTIONS_CHARS = 1_200;

function serializeToolResult(value: unknown): string {
  if (isRecord(value) && typeof value.content === "string") {
    const content = value.content;
    const preview = content.length <= 750
      ? content
      : content.slice(0, 250) + "\n...[middle omitted]...\n" +
        content.slice(Math.max(250, Math.floor(content.length / 2) - 125), Math.floor(content.length / 2) + 125) +
        "\n...[middle omitted]...\n" + content.slice(-250);
    const metadata = Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "content"),
    );
    return JSON.stringify({
      ...metadata,
      contentPreview: preview,
      contentTruncated: content.length > 750,
    });
  }
  return safeSerialize(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

  for (let index = 0; index < toolResults.length; index += 1) {
    const item = toolResults[index];
    const resultText = serializeToolResult(item.result);
    const remainingResults = toolResults.length - index;
    const available = MAX_SYNTHESIS_CONTEXT_CHARS - JSON.stringify(context).length;
    const wrapperBudget = item.callId.length + item.toolId.length + 90;
    let excerptLength = Math.min(
      resultText.length,
      MAX_RESULT_EXCERPT_CHARS,
      Math.max(0, Math.floor(available / remainingResults) - wrapperBudget),
    );
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

/** Keep provider system messages below the API's 4,000-character per-message limit. */
export function buildSynthesisSystemPrompt(role?: string, instructions?: string): string {
  const safeRole = typeof role === "string" ? role.slice(0, 120) : "specialist";
  const safeInstructions = typeof instructions === "string"
    ? instructions.slice(0, MAX_AGENT_INSTRUCTIONS_CHARS)
    : "";
  const guidance = safeInstructions
    ? ` Agent guidance (truncated when necessary): <agent_instructions>${safeInstructions}</agent_instructions>.`
    : "";
  return (
    `You are synthesizing results for Agent role: ${safeRole}.` +
    guidance +
    " Use only the task, plan and verified tool results. Never claim unperformed actions. Tool allowlists and execution limits remain mandatory."
  );
}
