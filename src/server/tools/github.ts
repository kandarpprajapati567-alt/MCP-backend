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
  const response = await fetch(GITHUB_API + "/repos/" + REPOSITORY + path, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + getToken(),
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Futuristic-System-MCP-Backend",
    },
    cache: "no-store",
  });
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
  const path = args.path === undefined ? "" : validatePath(args.path);
  const limit = positiveLimit(args.limit, 60, 100);
  const data = await githubGet("/git/trees/" + encodeURIComponent(ref) + "?recursive=1");
  if (!isRecord(data) || !Array.isArray(data.tree)) throw new Error("GitHub returned an unexpected repository tree.");
  const prefix = path ? path + "/" : "";
  const files = data.tree.filter(isRecord).filter((item) =>
    item.type === "blob" && typeof item.path === "string" &&
    (!path || item.path === path || item.path.startsWith(prefix)),
  ).map((item) => ({
    path: item.path as string,
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
