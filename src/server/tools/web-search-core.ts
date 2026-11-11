type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function searchWebWithKey(args: RecordValue, apiKey: string) {
  if (Object.keys(args).some((key) => key !== "query" && key !== "maxResults")) {
    throw new Error("web.search accepts only query and maxResults.");
  }
  const query = args.query;
  const maxResults = args.maxResults === undefined ? 5 : args.maxResults;
  if (typeof query !== "string" || query.trim().length < 2 || query.length > 500 ||
      typeof maxResults !== "number" || !Number.isInteger(maxResults) || maxResults < 1 || maxResults > 8) {
    throw new Error("web.search requires a query of 2–500 characters and maxResults from 1–8.");
  }
  if (typeof apiKey !== "string" || apiKey.length < 8 || apiKey.length > 4096) {
    throw new Error("Web Search credential is invalid.");
  }

  let response: Response;
  try {
    response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: query.trim(),
        max_results: maxResults,
        search_depth: "basic",
        include_answer: true,
        include_raw_content: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "TimeoutError") throw new Error("Web Search timed out after 15 seconds.");
    throw new Error("Web Search could not connect. Retry the task.");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("Tavily rejected the Web Search credential. Reconnect it in Dashboard → Connections.");
    if (response.status === 429) throw new Error("Tavily rate limit reached. Retry later or check the connected plan.");
    throw new Error("Web Search provider failed with HTTP " + response.status + ".");
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.results)) throw new Error("Web Search returned an unexpected response.");
  const results = payload.results.filter(isRecord).slice(0, maxResults).map((item) => ({
    title: typeof item.title === "string" ? item.title.slice(0, 300) : "",
    url: typeof item.url === "string" && /^https?:\/\//i.test(item.url) ? item.url : "",
    content: typeof item.content === "string" ? item.content.slice(0, 1800) : "",
    score: typeof item.score === "number" && Number.isFinite(item.score) ? item.score : null,
    publishedDate: typeof item.published_date === "string" ? item.published_date : null,
  })).filter((item) => item.title && item.url);
  return {
    provider: "tavily",
    query: query.trim(),
    answer: typeof payload.answer === "string" ? payload.answer.slice(0, 4000) : null,
    results,
    count: results.length,
  };
}
