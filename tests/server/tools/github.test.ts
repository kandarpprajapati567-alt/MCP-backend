import assert from "node:assert/strict";
import test from "node:test";
import { createGitHubAgentBranch, createGitHubAgentFile, createGitHubAgentPullRequest, getGitHubAgentCiStatus, listGitHubBranches, listGitHubCommits, listGitHubFiles, readGitHubFile, updateGitHubAgentFile } from "../../../src/server/tools/github";
import { TOOL_CATALOG } from "../../../src/server/tools/registry";

const originalToken = process.env.GITHUB_READ_TOKEN;
const originalWriteToken = process.env.GITHUB_WRITE_TOKEN;
const originalFetch = globalThis.fetch;

test.before(() => { process.env.GITHUB_READ_TOKEN = "github-read-only-test-token"; process.env.GITHUB_WRITE_TOKEN = "github-write-test-token"; });
test.after(() => {
  if (originalToken === undefined) delete process.env.GITHUB_READ_TOKEN;
  else process.env.GITHUB_READ_TOKEN = originalToken;
  if (originalWriteToken === undefined) delete process.env.GITHUB_WRITE_TOKEN;
  else process.env.GITHUB_WRITE_TOKEN = originalWriteToken;
  globalThis.fetch = originalFetch;
});

function mockResponse(body: unknown, status = 200) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch;
}

test("registers GitHub read tools as read-only and side-effect free", () => {
  const githubTools = TOOL_CATALOG.filter((tool) => tool.id.startsWith("github.") && tool.annotations.readOnlyHint);
  assert.deepEqual(githubTools.map((tool) => tool.id), [
    "github.list_branches",
    "github.list_commits",
    "github.list_files",
    "github.read_file",
    "github.get_ci_status",
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

test("normalizes GitHub request timeouts into a safe retry message", async () => {
  globalThis.fetch = (async () => {
    throw new DOMException("network timeout", "TimeoutError");
  }) as typeof fetch;
  await assert.rejects(() => listGitHubBranches({}), /timed out after 15 seconds/);
});


test("registers GitHub write tools as side-effecting and separate from read-only tools", () => {
  const writeTools = TOOL_CATALOG.filter((tool) => ["github.create_branch", "github.create_file", "github.update_file", "github.create_pull_request"].includes(tool.id));
  assert.equal(writeTools.length, 4);
  assert.ok(writeTools.every((tool) => tool.permission === "github.repository.write" && tool.sideEffect &&
    !tool.annotations.readOnlyHint && !tool.annotations.destructiveHint));
});

test("creates only agent-prefixed branches from a verified base ref", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    if (requests.length === 1) return new Response(JSON.stringify({ object: { sha: "a".repeat(40) } }), { status: 200 });
    return new Response(JSON.stringify({ ref: "refs/heads/agent/level3-work" }), { status: 201 });
  }) as typeof fetch;
  const result = await createGitHubAgentBranch({ branch: "agent/level3-work", baseRef: "main" });
  assert.equal(result.created, true);
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /\/git\/ref\/heads\/main$/);
  assert.equal(requests[1].init?.method, "POST");
  assert.equal(new Headers(requests[1].init?.headers).get("authorization"), "Bearer github-write-test-token");
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
    ref: "refs/heads/agent/level3-work", sha: "a".repeat(40),
  });
  await assert.rejects(() => createGitHubAgentBranch({ branch: "main" }), /agent\//);
});

test("creates and SHA-guards source/test file writes on agent branches", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ commit: { sha: "b".repeat(40) } }), { status: 201 });
  }) as typeof fetch;

  const created = await createGitHubAgentFile({
    path: "src/server/example.ts", branch: "agent/level3-work",
    content: "export const answer = 42;\n", message: "Add example source",
  });
  assert.equal(created.created, true);
  const createBody = JSON.parse(String(requests[0].init?.body));
  assert.equal(createBody.branch, "agent/level3-work");
  assert.equal(Buffer.from(createBody.content, "base64").toString("utf8"), "export const answer = 42;\n");

  const updated = await updateGitHubAgentFile({
    path: "tests/server/example.test.ts", branch: "agent/level3-work",
    content: "export {};\n", message: "Add example test", expectedSha: "c".repeat(40),
  });
  assert.equal(updated.updated, true);
  assert.equal(JSON.parse(String(requests[1].init?.body)).sha, "c".repeat(40));

  await assert.rejects(() => createGitHubAgentFile({
    path: "README.md", branch: "agent/level3-work", content: "no", message: "No",
  }), /limited to source and test/);
  await assert.rejects(() => updateGitHubAgentFile({
    path: "src/server/example.ts", branch: "agent/level3-work", content: "x", message: "No", expectedSha: "stale",
  }), /40-character expectedSha/);
});

test("GitHub write tools fail closed when GITHUB_WRITE_TOKEN is absent", async () => {
  const token = process.env.GITHUB_WRITE_TOKEN;
  delete process.env.GITHUB_WRITE_TOKEN;
  await assert.rejects(() => createGitHubAgentBranch({ branch: "agent/no-token" }), /GITHUB_WRITE_TOKEN/);
  process.env.GITHUB_WRITE_TOKEN = token;
});


test("opens draft pull requests only from agent branches and never merges", async () => {
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      number: 81, html_url: "https://github.com/kandarpprajapati567-alt/MCP-backend/pull/81",
      title: "Agent change", state: "open", draft: true, head: { sha: "d".repeat(40) },
    }), { status: 201 });
  }) as typeof fetch;
  const result = await createGitHubAgentPullRequest({
    branch: "agent/level3-work", title: "Agent change", body: "CI verification pending",
  });
  assert.equal(result.draft, true);
  assert.equal(result.base, "main");
  assert.equal(requestBody.base, "main");
  assert.equal(requestBody.draft, true);
  await assert.rejects(() => createGitHubAgentPullRequest({ branch: "main", title: "Unsafe" }), /agent\//);
});

test("CI status requires completed successful repository workflows and reports provider statuses separately", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({
      check_runs: [
        { name: "CI", status: "completed", conclusion: "success", html_url: "https://github.com/checks/ci" },
        { name: "Phase 1 checks", status: "completed", conclusion: "success" },
      ],
    }), { status: 200 });
    return new Response(JSON.stringify({
      statuses: [{ context: "Vercel – mcp-backend", state: "failure", description: "Build rate limit" }],
    }), { status: 200 });
  }) as typeof fetch;
  const result = await getGitHubAgentCiStatus({ ref: "agent/level3-work" });
  assert.equal(result.allPassed, true);
  assert.equal(result.requiredChecks.length, 2);
  assert.equal(result.otherChecks[0].state, "failure");
  assert.equal(calls, 2);
});

test("CI status fails closed when either required workflow is missing", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify(calls === 1
      ? { check_runs: [{ name: "CI", status: "completed", conclusion: "success" }] }
      : { statuses: [] }), { status: 200 });
  }) as typeof fetch;
  const result = await getGitHubAgentCiStatus({ ref: "agent/level3-work" });
  assert.equal(result.allPassed, false);
  assert.deepEqual(result.missingChecks, ["Phase 1 checks"]);
  assert.equal(result.pending, 0);
  assert.equal(result.failed, 0);
});

test("CI status never passes while a required workflow is pending or failed", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify(calls === 1
      ? { check_runs: [{ name: "CI", status: "in_progress", conclusion: null }] }
      : { statuses: [] }), { status: 200 });
  }) as typeof fetch;
  const result = await getGitHubAgentCiStatus({ ref: "agent/level3-work" });
  assert.equal(result.allPassed, false);
  assert.equal(result.pending, 1);
});
