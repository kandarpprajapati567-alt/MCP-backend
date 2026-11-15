export type SystemTestAgent = {
  enabled: boolean;
  provider_preference?: string;
  allowed_tools?: string[];
};

export type SystemTestTool = {
  id: string;
  sideEffect?: boolean;
};

export type ZeroCostLiveTest = {
  prompt: string;
  expected: "text.word_count" | "text.extract_keywords" | "text.text_stats";
};

const LOCAL_TEXT_TESTS: Record<string, ZeroCostLiveTest> = {
  "text.word_count": {
    prompt: "Use text.word_count on exactly this text: alpha beta gamma delta. Return only the numeric word count.",
    expected: "text.word_count",
  },
  "text.extract_keywords": {
    prompt: "Use text.extract_keywords on exactly this text: solar energy solar panels wind energy. Return only the extracted keywords.",
    expected: "text.extract_keywords",
  },
  "text.text_stats": {
    prompt: "Use text.text_stats on exactly this text: Futuristic System builds reliable AI agents. Return its character and word counts.",
    expected: "text.text_stats",
  },
};

export type ZeroCostLiveTestDecision =
  | { eligible: true; test: ZeroCostLiveTest }
  | { eligible: false; reason: string };

/**
 * The optional Live test is deliberately restricted to the deterministic Mock
 * planner and local text capabilities. It must never select provider-backed,
 * web, GitHub, Remote MCP, or Android device tools.
 */
export function selectZeroCostLiveTest(
  agent: SystemTestAgent,
  tools: readonly SystemTestTool[],
): ZeroCostLiveTestDecision {
  if (!agent.enabled) return { eligible: false, reason: "Agent is disabled." };
  if (agent.provider_preference !== "mock") {
    return { eligible: false, reason: "Zero-cost Live mode requires this Agent to use the Mock provider. No external model provider will be called." };
  }

  const assignedIds = Array.isArray(agent.allowed_tools)
    ? agent.allowed_tools.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  if (assignedIds.length === 0) {
    return { eligible: false, reason: "No tools are assigned to this Agent." };
  }

  const byId = new Map(tools.map((tool) => [tool.id, tool]));
  for (const id of assignedIds) {
    const tool = byId.get(id);
    if (!tool) return { eligible: false, reason: "An assigned tool is not present in the current registry." };
    if (tool.sideEffect !== false) {
      return { eligible: false, reason: "An assigned tool is not explicitly marked read-only." };
    }
    if (!id.startsWith("text.")) {
      return { eligible: false, reason: "This Agent has a non-local tool assignment. Zero-cost Live mode only runs local text tools." };
    }
  }

  const test = assignedIds.map((id) => LOCAL_TEXT_TESTS[id]).find(Boolean);
  if (!test) {
    return { eligible: false, reason: "No supported deterministic local text test is assigned." };
  }
  return { eligible: true, test };
}
