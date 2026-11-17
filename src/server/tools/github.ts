const GITHUB_API = "https://api.github.com";
const REPOSITORY = "kandarpprajapati567-alt/MCP-backend";
const MAX_FILE_BYTES = 200_000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getToken(): string {
  const token = process.env.GITHUB_READ_TOKEN?.trim();
  if (!token) {
    throw new Error("GitHub repository access is not configured. Add a fine-grained GITHUB_READ_TOKEN with read-only Contents and Metadata access.");
  }
  return token;
}

function validateRef(value: unknown): string {
  if (value === undefined) return "main";
  if (typeof value !== "string" || !value.trim() || value.length > 120 ||
      !/^[A-Za-z0-9._/-]+$/.test(value) || value.includes("..") || value.startsWith("/") || value.endsWith("/")) {
    throw new Error("ref must be a valid branch, tag, or commit reference (maximum 120 characters).");
  }
  return value;
}

function validatePath(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 240 ||
      value.startsWith("/") || value.includes("\\") || value.includes("\0") ||
      value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("path must be a valid repository-relative file or directory path.");
  }
  const lower = value.toLowerCase();
  if (/(^|\/)\.env($|\.)|(^|\/)(secrets?|credentials?)(\/|$)|\.(pem|key|p12|pfx)$/i.test(lower) ||
      /(^|\/)(\.git|node_modules)(\/|$)/i.test(lower) || /(^|\/)id_(rsa|ed25519)(\.pub)?$/i.test(lower)) {
    throw new Error("This path is excluded from repository reading because it may contain credentials or generated dependencies.");
  }
  return value;
}

async function githubGet(path: string): Promise<unknown> {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(GITHUB_API + "/repos/" + REPOSITORY + path, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Futuristic-System-MCP-Backend",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("GitHub read request timed out after 15 seconds.");
    }
    throw new Error("GitHub read request could not connect. Retry the task.");
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error("GitHub rejected GITHUB_READ_TOKEN. Check that the token is valid and not expired.");
    if (response.status === 403) throw new Error("GitHub denied repository read access or the API rate limit was reached. Check token permissions.");
    if (response.status === 404) throw new Error("GitHub repository or requested resource was not found. Confirm repository access and the supplied ref/path.");
    throw new Error("GitHub read request failed with HTTP " + response.status + ".");
  }
  return response.json();
}

function positiveLimit(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error("limit must be an integer between 1 and " + maximum + ".");
  }
  return value;
}

export async function listGitHubBranches(args: JsonRecord) {
  if (Object.keys(args).some((key) => key !== "query" && key !== "limit")) {
    throw new Error("github.list_branches accepts only query and limit.");
  }
  const query = args.query === undefined ? "" : args.query;
  if (typeof query !== "string" || query.length > 100) throw new Error("query must be a string of at most 100 characters.");
  const limit = positiveLimit(args.limit, 30, 100);
  const data = await githubGet("/branches?per_page=100");
  if (!Array.isArray(data)) throw new Error("GitHub returned an unexpected branch response.");
  const branches = data.filter(isRecord).map((item) => ({
    name: typeof item.name === "string" ? item.name : "",
    commitSha: isRecord(item.commit) && typeof item.commit.sha === "string" ? item.commit.sha : "",
    protected: item.protected === true,
  })).filter((item) => item.name && (!query || item.name.toLowerCase().includes(query.toLowerCase())));
  return { repository: REPOSITORY, branches: branches.slice(0, limit), count: Math.min(branches.length, limit), truncated: branches.length > limit || data.length === 100 };
}

export async function listGitHubCommits(args: JsonRecord) {
  if (Object.keys(args).some((key) => key !== "ref" && key !== "limit")) {
    throw new Error("github.list_commits accepts only ref and limit.");
  }
  const ref = validateRef(args.ref);
  const limit = positiveLimit(args.limit, 10, 30);
  const data = await githubGet("/commits?sha=" + encodeURIComponent(ref) + "&per_page=" + limit);
  if (!Array.isArray(data)) throw new Error("GitHub returned an unexpected commit response.");
  const commits = data.filter(isRecord).map((item) => {
    const commit = isRecord(item.commit) ? item.commit : {};
    const author = isRecord(commit.author) ? commit.author : {};
    return {
      sha: typeof item.sha === "string" ? item.sha : "",
      message: typeof commit.message === "string" ? commit.message.split("\n")[0].slice(0, 200) : "",
      date: typeof author.date === "string" ? author.date : null,
      url: typeof item.html_url === "string" ? item.html_url : null,
    };
  });
  return { repository: REPOSITORY, ref, commits, count: commits.length };
}

export async function listGitHubFiles(args: JsonRecord) {
  if (Object.keys(args).some((key) => key !== "ref" && key !== "path" && key !== "limit")) {
    throw new Error("github.list_files accepts only ref, path and limit.");
  }
  const ref = validateRef(args.ref);
  const path = args.path === undefined || args.path === "" ? "" : validatePath(args.path);
  const limit = positiveLimit(args.limit, 60, 100);
  const data = await githubGet("/git/trees/" + encodeURIComponent(ref) + "?recursive=1");
  if (!isRecord(data) || !Array.isArray(data.tree)) throw new Error("GitHub returned an unexpected repository tree.");
  const prefix = path ? path + "/" : "";
  const files = data.tree.filter(isRecord).filter((item) => {
    if ((item.type !== "blob" && item.type !== "tree") || typeof item.path !== "string") return false;
    const relativePath = path
      ? item.path.startsWith(prefix) ? item.path.slice(prefix.length) : ""
      : item.path;
    return relativePath.length > 0 && !relativePath.includes("/");
  }).map((item) => ({
    path: item.path as string,
    type: item.type === "tree" ? "directory" as const : "file" as const,
    size: typeof item.size === "number" ? item.size : null,
  })).sort((a, b) => a.path.localeCompare(b.path));
  return {
    repository: REPOSITORY,
    ref,
    path: path || "/",
    files: files.slice(0, limit),
    count: Math.min(files.length, limit),
    truncated: data.truncated === true || files.length > limit,
  };
}

export async function readGitHubFile(args: JsonRecord) {
  if (Object.keys(args).some((key) => key !== "ref" && key !== "path")) {
    throw new Error("github.read_file accepts only path and ref.");
  }
  const ref = validateRef(args.ref);
  const path = validatePath(args.path);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const data = await githubGet("/contents/" + encodedPath + "?ref=" + encodeURIComponent(ref));
  if (!isRecord(data) || data.type !== "file" || data.encoding !== "base64" ||
      typeof data.content !== "string" || typeof data.size !== "number") {
    throw new Error("The requested path is not a supported text file.");
  }
  if (data.size > MAX_FILE_BYTES) throw new Error("File exceeds the 200 KB read limit.");
  const content = Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf8");
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES || content.includes("\0")) {
    throw new Error("The requested file is too large or is not a supported text file.");
  }
  return {
    repository: REPOSITORY,
    ref,
    path,
    size: Buffer.byteLength(content, "utf8"),
    sha: typeof data.sha === "string" ? data.sha : null,
    url: typeof data.html_url === "string" ? data.html_url : null,
    content,
  };
}


const MAX_WRITE_FILE_BYTES = 100_000;

function getWriteToken(): string {
  const token = process.env.GITHUB_WRITE_TOKEN?.trim();
  if (!token) throw new Error("GitHub write access is not configured. Add GITHUB_WRITE_TOKEN with fine-grained Contents read/write and Metadata read permissions.");
  return token;
}

function validateAgentBranch(value: unknown): string {
  if (typeof value !== "string" || !/^agent\/[a-z0-9][a-z0-9._/-]{0,78}$/i.test(value) ||
      value.includes("..") || value.includes("//") || value.endsWith("/") || value.includes("@{")) {
    throw new Error("Writes are restricted to a valid agent/<name> feature branch.");
  }
  return value;
}

function validateWritablePath(value: unknown): string {
  const path = validatePath(value);
  if (!(path.startsWith("src/") || path.startsWith("tests/")) ||
      !/\.(tsx?|jsx?|json|md|css|sql)$/i.test(path) ||
      /^\.github\//i.test(path) || /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i.test(path)) {
    throw new Error("Agent writes are limited to source and test text files under src/ and tests/.");
  }
  return path;
}

function validateWriteContent(value: unknown): string {
  if (typeof value !== "string" || !value.length || Buffer.byteLength(value, "utf8") > MAX_WRITE_FILE_BYTES || value.includes("\0")) {
    throw new Error("content must be non-empty UTF-8 text no larger than 100 KB.");
  }
  return value;
}

async function githubWriteRequest(method: "POST" | "PUT", path: string, body: Record<string, unknown>): Promise<unknown> {
  const token = getWriteToken();
  let response: Response;
  try {
    response = await fetch(GITHUB_API + "/repos/" + REPOSITORY + path, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Futuristic-System-MCP-Backend",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new Error("GitHub write request timed out after 15 seconds.");
    throw new Error("GitHub write request could not connect. Retry after checking the network.");
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error("GitHub rejected GITHUB_WRITE_TOKEN. Check that it is valid and not expired.");
    if (response.status === 403) throw new Error("GitHub denied write access or the API rate limit was reached. Check Contents read/write permission.");
    if (response.status === 404) throw new Error("GitHub repository or base ref was not found. Confirm token repository access.");
    if (response.status === 409 || response.status === 422) throw new Error("GitHub rejected the write because the branch or file state changed. Re-read the branch/file and retry with the current SHA.");
    throw new Error("GitHub write request failed with HTTP " + response.status + ".");
  }
  return response.json();
}

export async function createGitHubAgentBranch(args: JsonRecord) {
  if (Object.keys(args).some((key) => key !== "branch" && key !== "baseRef")) {
    throw new Error("github.create_branch accepts only branch and baseRef.");
  }
  const branch = validateAgentBranch(args.branch);
  const baseRef = validateRef(args.baseRef);
  const base = await githubWriteRequest("POST", "/git/refs", { ref: "refs/heads/" + branch, sha: await (async () => {
    const token = getWriteToken();
    const response = await fetch(GITHUB_API + "/repos/" + REPOSITORY + "/git/ref/heads/" + baseRef.split("/").map(encodeURIComponent).join("/"), {
      headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Futuristic-System-MCP-Backend" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("GitHub base branch could not be read (HTTP " + response.status + ").");
    const data: unknown = await response.json();
    if (!isRecord(data) || !isRecord(data.object) || typeof data.object.sha !== "string") throw new Error("GitHub returned an invalid base branch reference.");
    return data.object.sha;
  })() });
  if (!isRecord(base) || typeof base.ref !== "string") {
    throw new Error("GitHub created the branch but returned an unexpected reference.");
  }
  return { repository: REPOSITORY, branch, baseRef, created: true, ref: base.ref };
}

export async function createGitHubAgentFile(args: JsonRecord) {
  if (Object.keys(args).some((key) => !["path", "branch", "content", "message"].includes(key)) ||
      typeof args.message !== "string" || !args.message.trim() || args.message.length > 120) {
    throw new Error("github.create_file requires path, branch, content and a 1–120 character message.");
  }
  const path = validateWritablePath(args.path);
  const branch = validateAgentBranch(args.branch);
  const content = validateWriteContent(args.content);
  const result = await githubWriteRequest("PUT", "/contents/" + path.split("/").map(encodeURIComponent).join("/"), {
    message: args.message.trim(),
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
  });
  if (!isRecord(result) || !isRecord(result.commit) || typeof result.commit.sha !== "string") throw new Error("GitHub created the file but returned an unexpected commit.");
  return { repository: REPOSITORY, branch, path, created: true, commitSha: result.commit.sha };
}

export async function updateGitHubAgentFile(args: JsonRecord) {
  if (Object.keys(args).some((key) => !["path", "branch", "content", "message", "expectedSha"].includes(key)) ||
      typeof args.message !== "string" || !args.message.trim() || args.message.length > 120 ||
      typeof args.expectedSha !== "string" || !/^[a-f0-9]{40}$/i.test(args.expectedSha)) {
    throw new Error("github.update_file requires path, branch, content, message and a 40-character expectedSha.");
  }
  const path = validateWritablePath(args.path);
  const branch = validateAgentBranch(args.branch);
  const content = validateWriteContent(args.content);
  const result = await githubWriteRequest("PUT", "/contents/" + path.split("/").map(encodeURIComponent).join("/"), {
    message: args.message.trim(),
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
    sha: args.expectedSha,
  });
  if (!isRecord(result) || !isRecord(result.commit) || typeof result.commit.sha !== "string") throw new Error("GitHub updated the file but returned an unexpected commit.");
  return { repository: REPOSITORY, branch, path, updated: true, commitSha: result.commit.sha };
}


export async function createGitHubAgentPullRequest(args: JsonRecord) {
  if (Object.keys(args).some((key) => !["branch", "title", "body"].includes(key)) ||
      typeof args.title !== "string" || !args.title.trim() || args.title.length > 120 ||
      (args.body !== undefined && (typeof args.body !== "string" || args.body.length > 8000))) {
    throw new Error("github.create_pull_request requires branch, a 1–120 character title and an optional body up to 8000 characters.");
  }
  const branch = validateAgentBranch(args.branch);
  const result = await githubWriteRequest("POST", "/pulls", {
    title: args.title.trim(),
    head: branch,
    base: "main",
    body: typeof args.body === "string" ? args.body : "",
    draft: true,
  });
  if (!isRecord(result) || typeof result.number !== "number" || typeof result.html_url !== "string" ||
      !isRecord(result.head) || typeof result.head.sha !== "string") {
    throw new Error("GitHub created the pull request but returned an unexpected response.");
  }
  return {
    repository: REPOSITORY,
    number: result.number,
    url: result.html_url,
    title: typeof result.title === "string" ? result.title : args.title.trim(),
    state: typeof result.state === "string" ? result.state : "open",
    draft: result.draft === true,
    headSha: result.head.sha,
    base: "main",
  };
}

export async function getGitHubAgentCiStatus(args: JsonRecord) {
  if (Object.keys(args).some((key) => key !== "ref")) throw new Error("github.get_ci_status accepts only ref.");
  const ref = validateRef(args.ref);
  const encodedRef = ref.split("/").map(encodeURIComponent).join("/");
  const [checkData, statusData] = await Promise.all([
    githubGet("/commits/" + encodedRef + "/check-runs?per_page=100"),
    githubGet("/commits/" + encodedRef + "/status"),
  ]);
  const checkRuns = isRecord(checkData) && Array.isArray(checkData.check_runs) ? checkData.check_runs.filter(isRecord) : [];
  const contexts = isRecord(statusData) && Array.isArray(statusData.statuses) ? statusData.statuses.filter(isRecord) : [];
  const requiredChecks = checkRuns.filter((item) => item.name === "CI" || item.name === "Phase 1 checks").map((item) => ({
    name: typeof item.name === "string" ? item.name : "unknown",
    status: typeof item.status === "string" ? item.status : "unknown",
    conclusion: typeof item.conclusion === "string" ? item.conclusion : null,
    url: typeof item.html_url === "string" ? item.html_url : null,
  }));
  const otherChecks = contexts.map((item) => ({
    context: typeof item.context === "string" ? item.context : "unknown",
    state: typeof item.state === "string" ? item.state : "unknown",
    description: typeof item.description === "string" ? item.description.slice(0, 240) : "",
    url: typeof item.target_url === "string" ? item.target_url : null,
  }));
  const pending = requiredChecks.filter((item) => item.status !== "completed").length;
  const failed = requiredChecks.filter((item) => item.status === "completed" && !["success", "neutral", "skipped"].includes(item.conclusion ?? "")).length;
  const allPassed = requiredChecks.length > 0 && pending === 0 && failed === 0;
  return {
    repository: REPOSITORY,
    ref,
    allPassed,
    requiredChecks,
    pending,
    failed,
    otherChecks,
    note: "Only the repository CI and Phase 1 GitHub Actions checks gate this result. Other provider statuses are shown separately.",
  };
}
