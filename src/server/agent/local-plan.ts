import type { AgentDefinitionInput } from "./definition-schema";

export type LocalAgentPlan = {
  version: 1;
  goal: string;
  steps: Array<{ id: string; objective: string; expectedOutcome: string }>;
  toolCalls: Array<{ id: string; toolId: string; arguments: Record<string, unknown> }>;
};

function extractInput(task: string, toolId: string): string {
  const patterns: Record<string, RegExp[]> = {
    "text.word_count": [
      /^(?:please\s+)?count\s+words?\s+(?:in|of)\s*:?\s*(.+)$/i,
      /^(?:please\s+)?count\s+words?\s*[:\-]\s*(.+)$/i,
      /^(?:please\s+)?word\s+count\s*[:\-]\s*(.+)$/i,
    ],
    "text.extract_keywords": [
      /^(?:please\s+)?extract\s+keywords?\s+from\s*:?\s*(.+)$/i,
      /^(?:please\s+)?keywords?\s*[:\-]\s*(.+)$/i,
    ],
    "text.text_stats": [
      /^(?:please\s+)?(?:text\s+stats|text\s+statistics)\s+(?:for|of|in)\s*:?\s*(.+)$/i,
      /^(?:please\s+)?(?:text\s+stats|text\s+statistics)\s*[:\-]\s*(.+)$/i,
      /^(?:please\s+)?character\s+count\s+(?:for|of|in)\s*:?\s*(.+)$/i,
    ],
  };
  for (const pattern of patterns[toolId] ?? []) {
    const match = task.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  throw new Error("Add the text to process after a colon, for example: Count words in: apple banana.");
}

export function buildLocalAgentPlan(task: string, agent?: AgentDefinitionInput): LocalAgentPlan {
  const lower = task.toLowerCase();
  const requestsResearch = /\\b(research|search|find|investigate|look up|latest|documentation|sources?)\\b/i.test(lower);
  if (requestsResearch) {
    if (agent && (!agent.allowedTools.includes("web.search") || agent.maxToolCalls === 0)) {
      throw new Error("This Agent cannot use web.search. Assign the approved web.search tool in Agent Manager, then retry.");
    }
    return {
      version: 1,
      goal: task.slice(0, 500),
      steps: [{
        id: "step-1",
        objective: "Search public web sources for the user's stated research objective.",
        expectedOutcome: "A bounded list of source titles, URLs and excerpts.",
      }],
      toolCalls: [{ id: "call-1", toolId: "web.search", arguments: { query: task.slice(0, 500), maxResults: 5 } }],
    };
  }

  const toolId = lower.includes("word count") || lower.includes("count word")
    ? "text.word_count"
    : lower.includes("keyword")
      ? "text.extract_keywords"
      : lower.includes("text stats") || lower.includes("text statistics") || lower.includes("character count")
        ? "text.text_stats"
        : null;

  if (toolId && agent && (!agent.allowedTools.includes(toolId) || agent.maxToolCalls === 0)) {
    throw new Error("This Agent cannot use " + toolId + ". Assign the tool in Agent Manager, then retry.");
  }

  const toolText = toolId ? extractInput(task, toolId) : "";
  return {
    version: 1,
    goal: task.slice(0, 500),
    steps: [{
      id: "step-1",
      objective: toolId ? "Process only the text supplied by the user." : "Interpret the request and complete the available safe operation.",
      expectedOutcome: toolId ? "A result derived from the supplied text." : "A bounded result with execution evidence.",
    }],
    toolCalls: toolId ? [{ id: "call-1", toolId, arguments: { text: toolText } }] : [],
  };
}
