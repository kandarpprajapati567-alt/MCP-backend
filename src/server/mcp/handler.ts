import "server-only";

import { verifyOwnerRequest } from "../security/owner-auth";
import { executeRegisteredTool, TOOL_CATALOG } from "../tools/registry";

const SUPPORTED_PROTOCOL_VERSIONS = ["2026-07-28", "2025-11-25"] as const;
const SERVER_INFO = { name: "futuristic-system-mcp", version: "0.2.0" };
const MAX_BODY_BYTES = 32 * 1024;

type JsonRpcId = string | number;
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: unknown, status = 200, protocolVersion?: string): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
  return new Response(JSON.stringify(body), { status, headers });
}

function rpcResult(id: JsonRpcId, result: unknown, version: string): Response {
  return json({ jsonrpc: "2.0", id, result }, 200, version);
}

function rpcError(id: JsonRpcId | null, code: number, message: string, status = 200, version?: string): Response {
  return json({ jsonrpc: "2.0", id, error: { code, message } }, status, version);
}

function noContent(): Response {
  return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
}

function protocolVersionFor(request: Request, method: string): string | null {
  if (method === "initialize") return "2026-07-28";
  const value = request.headers.get("MCP-Protocol-Version");
  if (!value || !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(value)) return null;
  return value;
}

function getResource(uri: string): { uri: string; mimeType: string; text: string } | null {
  if (uri === "futuristic://backend/status") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        name: "Futuristic System MCP Backend",
        version: SERVER_INFO.version,
        mode: "personal-owner",
        transport: "streamable-http-json",
        capabilities: ["tools", "resources", "prompts", "agent-tasks", "provider-routing"],
      }),
    };
  }
  if (uri === "futuristic://tools/catalog") {
    return { uri, mimeType: "application/json", text: JSON.stringify(TOOL_CATALOG) };
  }
  return null;
}

function listPrompts() {
  return [
    {
      name: "task-planning",
      description: "Create a bounded, structured plan for a user task.",
      arguments: [{ name: "task", description: "The user's task.", required: true }],
    },
    {
      name: "summarize-text",
      description: "Summarize supplied text without inventing unsupported facts.",
      arguments: [{ name: "text", description: "Text to summarize.", required: true }],
    },
  ];
}

function getPrompt(name: string, args: JsonRecord) {
  if (name === "task-planning") {
    const task = args.task;
    if (typeof task !== "string" || !task.trim() || task.length > 4000) {
      throw new Error("task must be a non-empty string of at most 4000 characters.");
    }
    return {
      description: "Plan the task as a sequence of bounded, verifiable steps.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Plan this task. Do not claim that tools have run.",
              "Return a JSON object with goal, steps, and toolCalls.",
              "Use only tools discovered from tools/list; ask for missing information rather than guessing.",
              "Task: " + task.trim(),
            ].join("\n"),
          },
        },
      ],
    };
  }

  if (name === "summarize-text") {
    const text = args.text;
    if (typeof text !== "string" || !text.trim() || text.length > 20000) {
      throw new Error("text must be a non-empty string of at most 20000 characters.");
    }
    return {
      description: "Summarize the supplied text faithfully.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Summarize only the following source text. Preserve important facts and mark uncertainty.\n\n" + text,
          },
        },
      ],
    };
  }

  throw new Error("Prompt not found.");
}

function dispatch(method: string, params: JsonRecord, id: JsonRpcId, version: string): Response {
  if (method === "ping") return rpcResult(id, {}, version);

  if (method === "tools/list") {
    return rpcResult(
      requestId,
      {
        tools: TOOL_CATALOG.map((tool) => ({
          name: tool.id,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
        })),
      },
      version,
    );
  }

  if (method === "tools/call") {
    if (typeof params.name !== "string") return rpcError(id, -32602, "params.name is required.", 200, version);
    const args = params.arguments === undefined ? {} : params.arguments;
    if (!isRecord(args)) return rpcError(id, -32602, "params.arguments must be an object.", 200, version);
    try {
      const result = executeRegisteredTool(params.name, args);
      return rpcResult(
        id,
        { content: [{ type: "text", text: JSON.stringify(result) }], isError: false },
        version,
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Tool execution failed.";
      return rpcResult(
        id,
        { content: [{ type: "text", text: message }], isError: true },
        version,
      );
    }
  }

  if (method === "resources/list") {
    return rpcResult(
      id,
      {
        resources: [
          { uri: "futuristic://backend/status", name: "Backend status", description: "Backend identity and supported capabilities.", mimeType: "application/json" },
          { uri: "futuristic://tools/catalog", name: "Tool catalog", description: "Registered safe backend tools and their schemas.", mimeType: "application/json" },
        ],
      },
      version,
    );
  }

  if (method === "resources/read") {
    if (typeof params.uri !== "string") return rpcError(id, -32602, "params.uri is required.", 200, version);
    const resource = getResource(params.uri);
    if (!resource) return rpcError(id, -32602, "Resource not found.", 200, version);
    return rpcResult(id, { contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: resource.text }] }, version);
  }

  if (method === "prompts/list") return rpcResult(id, { prompts: listPrompts() }, version);

  if (method === "prompts/get") {
    if (typeof params.name !== "string") return rpcError(id, -32602, "params.name is required.", 200, version);
    try {
      return rpcResult(id, getPrompt(params.name, isRecord(params.arguments) ? params.arguments : {}), version);
    } catch (cause) {
      return rpcError(id, -32602, cause instanceof Error ? cause.message : "Prompt not found.", 200, version);
    }
  }

  return rpcError(id, -32601, "Method not found: " + method, 200, version);
}

/**
 * Stateless Streamable HTTP endpoint in JSON response mode.
 * A fresh JSON-RPC request is handled independently; no server-side MCP session is kept.
 */
export async function handleMcpRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST for MCP JSON-RPC requests." }, 405);
  }

  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return json({ error: "Content-Type must be application/json." }, 415);

  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
    return json({ error: "Accept must include application/json and text/event-stream." }, 406);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "Unable to read request body." }, 400);
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return json({ error: "Request body too large." }, 413);

  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return rpcError(null, -32700, "Parse error.", 400);
  }

  if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(null, -32600, "Invalid JSON-RPC request.", 400);
  }

  const hasId = typeof message.id === "string" || typeof message.id === "number";
  const id = hasId ? (message.id as JsonRpcId) : null;
  const method = message.method;
  const version = protocolVersionFor(request, method);

  if (!version) {
    return json({ error: "A supported MCP-Protocol-Version header is required after initialize." }, 400);
  }

  if (!hasId) {
    if (method.startsWith("notifications/")) return noContent();
    return rpcError(null, -32600, "Requests must include a string or numeric id.", 400, version);
  }

  const requestId = message.id as JsonRpcId;
  const params = message.params === undefined ? {} : message.params;
  if (!isRecord(params)) return rpcError(requestId, -32602, "params must be an object.", 200, version);

  if (method === "initialize") {
    const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
    const selected = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
      ? requested
      : SUPPORTED_PROTOCOL_VERSIONS[0];
    return rpcResult(
      id,
      {
        protocolVersion: selected,
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: SERVER_INFO,
        instructions: "Futuristic System personal MCP backend. Discover tools before calling them. Android device tools are not available until an Android client registers them.",
      },
      selected,
    );
  }

  return dispatch(method, params, requestId, version);
}
