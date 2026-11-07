export type RegisteredToolId =
  | "text.word_count"
  | "text.extract_keywords"
  | "text.text_stats"
  | "memory.search"
  | "memory.store"
  | "device.list"
  | "device.dispatch_tool";

export type ToolDefinition = {
  id: RegisteredToolId;
  description: string;
  permission: string;
  sideEffect: boolean;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
};

const STOP_WORDS = new Set([
  "the","and","for","that","with","this","from","are","was","were","you","your","have","has","had","not","but","into","about","what","when","where","which","who","how","why","can","could","should","would","will","shall","a","an","of","to","in","on","at","by","is","it","as","or","be","if","we","they","he","she","i","me","my","our","their",
]);

const textInputSchema: ToolDefinition["inputSchema"] = {
  type: "object",
  properties: {
    text: { type: "string", maxLength: 12000, description: "Text to process. Maximum 12,000 characters." },
  },
  required: ["text"],
  additionalProperties: false,
};

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const writeIdempotent = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const deviceDispatch = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

export const TOOL_CATALOG: readonly ToolDefinition[] = [
  { id: "text.word_count", description: "Count words in supplied text.", permission: "local_text_read", sideEffect: false, inputSchema: textInputSchema, annotations: readOnly },
  { id: "text.extract_keywords", description: "Extract frequent meaningful keywords from supplied text.", permission: "local_text_read", sideEffect: false, inputSchema: textInputSchema, annotations: readOnly },
  { id: "text.text_stats", description: "Return character, word, and sentence counts for supplied text.", permission: "local_text_read", sideEffect: false, inputSchema: textInputSchema, annotations: readOnly },
  {
    id: "memory.search",
    description: "Search the owner's persistent memory by namespace and text.",
    permission: "memory.read",
    sideEffect: false,
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", maxLength: 80, description: "Memory namespace. Defaults to default." },
        query: { type: "string", maxLength: 160, description: "Optional text search query." },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Maximum records to return." },
      },
      required: [],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    id: "memory.store",
    description: "Create or update a keyed persistent memory record.",
    permission: "memory.write",
    sideEffect: true,
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", maxLength: 80 },
        key: { type: "string", minLength: 1, maxLength: 160 },
        content: { type: "string", minLength: 1, maxLength: 12000 },
        importance: { type: "integer", minimum: 1, maximum: 5 },
        metadata: { type: "object" },
      },
      required: ["key", "content"],
      additionalProperties: false,
    },
    annotations: writeIdempotent,
  },
  {
    id: "device.list",
    description: "List registered connected devices and their advertised tool capabilities.",
    permission: "device.registry.read",
    sideEffect: false,
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    annotations: readOnly,
  },
  {
    id: "device.dispatch_tool",
    description: "Queue a registered Android or Windows device tool for client-side permission checks and execution.",
    permission: "device.tool.dispatch",
    sideEffect: true,
    inputSchema: {
      type: "object",
      properties: {
        deviceId: { type: "string", minLength: 1, maxLength: 128 },
        toolId: { type: "string", minLength: 2, maxLength: 160 },
        toolCallId: { type: "string", minLength: 1, maxLength: 80 },
        taskId: { type: "string", description: "Optional task UUID." },
        arguments: { type: "object" },
      },
      required: ["deviceId", "toolId", "toolCallId", "arguments"],
      additionalProperties: false,
    },
    annotations: deviceDispatch,
  },
];

function readText(args: Record<string, unknown>): string {
  if (Object.keys(args).length !== 1 || typeof args.text !== "string" || args.text.length > 12000) {
    throw new Error("Tool arguments must contain only text (maximum 12000 characters).");
  }
  return args.text;
}

export function executeRegisteredTool(toolId: string, args: Record<string, unknown>) {
  if (toolId === "text.word_count") {
    const text = readText(args);
    return { wordCount: text.trim() ? text.trim().split(/\s+/u).length : 0 };
  }
  if (toolId === "text.extract_keywords") {
    const text = readText(args);
    const counts = new Map<string, number>();
    for (const match of text.toLocaleLowerCase().matchAll(/[\p{L}\p{N}]{3,}/gu)) {
      const word = match[0];
      if (!STOP_WORDS.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    return {
      keywords: [...counts]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 12)
        .map(([keyword, count]) => ({ keyword, count })),
    };
  }
  if (toolId === "text.text_stats") {
    const text = readText(args);
    return {
      characters: text.length,
      charactersWithoutWhitespace: text.replace(/\s/gu, "").length,
      words: text.trim() ? text.trim().split(/\s+/u).length : 0,
      sentences: (text.match(/[.!?]+(?=\s|$)/gu) ?? []).length,
    };
  }
  throw new Error("Tool is not registered as a synchronous text tool.");
}
