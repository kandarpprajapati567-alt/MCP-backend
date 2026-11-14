import { AIProviderError } from "@/server/ai/providers/types";

/**
 * Expose only curated provider errors and known validation messages to the
 * authenticated task owner. Unknown exceptions may contain database details,
 * request data, or credentials, so they are replaced with a safe message.
 */
export function safeAgentFailureMessage(error: unknown): string {
  if (error instanceof AIProviderError) {
    return (error.code + ": " + error.message).slice(0, 240);
  }

  if (!(error instanceof Error)) {
    return "Unexpected internal error. Check server logs using the task ID.";
  }

  const message = error.message;
  const knownMessages = new Set([
    "Planner returned invalid JSON.",
    "Agent execution policy rejected the generated plan.",
    "The Agent's selected AI provider is not configured.",
    "Device capabilities could not be loaded.",
    "Device tool job could not be queued.",
    "No configured provider could execute this workflow.",
    "GitHub read request timed out after 15 seconds.",
    "GitHub read request could not connect. Retry the task.",
    "File exceeds the 200 KB read limit.",
    "The requested path is not a supported text file.",
    "GitHub repository or requested resource was not found. Confirm repository access and the supplied ref/path.",
    "GitHub rejected GITHUB_READ_TOKEN. Check that the token is valid and not expired.",
    "GitHub denied repository read access or the API rate limit was reached. Check token permissions.",
    "The requested file is too large or is not a supported text file.",
    "Agent execution budget exceeded.",
    "One or more registered tool calls failed.",
    "Web Search connection could not be loaded.",
    "Web Search is not connected. Add a Tavily API key in Dashboard → Connections.",
    "Stored Web Search credential could not be decrypted.",
  ]);
  if (knownMessages.has(message) || /^GitHub read request failed with HTTP [0-9]{3}\.$/.test(message)) return message;

  if (/^(Plan must contain only version, goal, steps, and toolCalls|Unsupported plan version|Plan goal must be between 1 and 500 characters|Each step must contain only id, objective, and expectedOutcome|Step IDs must be unique values from step-1 through step-8|Each objective must be between 1 and 500 characters|Each expected outcome must be between 1 and 300 characters|Tool calls must contain only id, toolId, and arguments|Tool call IDs must be unique call-1 through call-4|Plan requested a tool that is not currently available|Tool arguments failed the registered input schema)\.$/.test(message) ||
      /^Plan must contain between 1 and [1-8] steps\.$/.test(message) ||
      /^Plan may contain at most [0-4] registered tool calls\.$/.test(message)) {
    return message;
  }

  return "Unexpected internal error. Check server logs using the task ID.";
}
