import assert from "node:assert/strict";
import test from "node:test";
import { listGitHubBranches, listGitHubCommits, listGitHubFiles, readGitHubFile } from "../../../src/server/tools/github";
import { TOOL_CATALOG } from "../../../src/server/tools/registry";

const originalToken = process.env.GITHUB_READ_TOKEN;
const originalFetch = globalThis.fetch;

test.before(() => { process.env.GITHUB_READ_TOKEN = "github-read-only-test-token"; });
test.after(() => {
  if (originalToken === undefined) delete process.env.GITHUB_READ_TOKEN;
  else process.env.GITHUB_READ_TOKEN = originalToken;
  globalThis.fetch = originalFetch;
});

function mockResponse(body: unknown, status = 200) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch;
}

test("registers four GitHub tools as read-only and side-effect free", () => {
  const githubTools = TOOL_CATALOG.filter((tool) => tool.id.startsWith("github."));
  assert.deepEqual(githubTools.map((tool) => tool.id), [
    "github.list_branches",
    "github.list_commits",
    "github.list_files",
    "github.read_file",
  ]);
  assert.equal(githubTools.every((tool) => !tool.sideEffect && tool.annotations.readOnlyHint &&
    !tool.annotations.destructiveHint && tool.annotations.openWorldHint), true);
});

test("lists branches from the fixed repository using GET and a server-side token", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify([
      { name: "main", commit: { sha: "abc123" }, protected: true },
      { name: "feature/demo", commit: { sha: "def456" }, protected: false },
    ]), { status: 200 });
  }) as typeof fetch;

  const result = await listGitHubBranches({ query: "feature", limit: 5 });
  assert.equal(requestUrl, "https://api.github.com/repos/kandarpprajapati567-alt/MCP-backend/branches?per_page=100");
  assert.equal(requestInit?.method, "GET");
  assert.equal(new Headers(requestInit?.headers).get("authorization"), "Bearer github-read-only-test-token");
  assert.deepEqual(result.branches.map((branch) => branch.name), ["feature/demo"]);
});

test("lists commits and repository files with bounded results", async () => {
  mockResponse([
    { sha: "abc123", commit: { message: "Add feature\nDetails", author: { date: "2026-11-11T10:00:00Z" } }, html_url: "https://github.com/example/commit/abc123" },
  ]);
  const commits = await listGitHubCommits({ ref: "main", limit: 2 });
  assert.equal(commits.count, 1);
  assert.equal(commits.commits[0].message, "Add feature");

  mockResponse({ truncated: false, tree: [
    { path: "src/index.ts", type: "blob", size: 100 },
    { path: "src/lib", type: "tree" },
    { path: "src/lib/helper.ts", type: "blob", size: 50 },
    { path: "README.md", type: "blob", size: 20 },
    { path: "src", type: "tree" },
  ] });
  const files = await listGitHubFiles({ path: "src", limit: 1 });
  assert.equal(files.count, 1);
  assert.equal(files.files[0].path, "src/index.ts");
  assert.equal(files.files[0].type, "file");
  assert.equal(files.truncated, true);

  mockResponse({ truncated: false, tree: [
    { path: "README.md", type: "blob", size: 20 },
    { path: "src", type: "tree" },
    { path: "src/index.ts", type: "blob", size: 100 },
    { path: "tests", type: "tree" },
    { path: "tests/server/example.test.ts", type: "blob", size: 80 },
  ] });
  const root = await listGitHubFiles({ path: "", limit: 10 });
  assert.equal(root.path, "/");
  assert.deepEqual(root.files.map((entry) => [entry.path, entry.type]), [
    ["README.md", "file"],
    ["src", "directory"],
    ["tests", "directory"],
  ]);
});

test("reads UTF-8 text files and rejects traversal and secret-like paths", async () => {
  let calls = 0;
  const source = "export const answer = 42;\n";
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({
      type: "file",
      encoding: "base64",
      size: Buffer.byteLength(source),
      content: Buffer.from(source, "utf8").toString("base64"),
      sha: "blob123",
      html_url: "https://github.com/example/blob/main/src/example.ts",
    }), { status: 200 });
  }) as typeof fetch;

  const file = await readGitHubFile({ path: "src/example.ts" });
  assert.equal(file.content, source);
  assert.equal(file.sha, "blob123");
  await assert.rejects(() => readGitHubFile({ path: "../.env" }), /repository-relative/);
  await assert.rejects(() => readGitHubFile({ path: ".env.local" }), /excluded/);
  assert.equal(calls, 1);
});

test("requires a token and rejects unexpected arguments and invalid limits", async () => {
  const token = process.env.GITHUB_READ_TOKEN;
  delete process.env.GITHUB_READ_TOKEN;
  await assert.rejects(() => listGitHubBranches({}), /GITHUB_READ_TOKEN/);
  process.env.GITHUB_READ_TOKEN = token;
  await assert.rejects(() => listGitHubBranches({ owner: "attacker/repo" }), /only query and limit/);
  await assert.rejects(() => listGitHubCommits({ limit: 31 }), /between 1 and 30/);
});
