import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { GitHubService, normalizeGitHubContext } from "../src/main/github-service.mjs";

test("GitHub context normalization bounds collaboration and policy data", () => {
  const result = normalizeGitHubContext({
    repository: { nameWithOwner: "owner/repo", url: "https://github.com/owner/repo", defaultBranchRef: { name: "main" }, visibility: "PRIVATE", viewerPermission: "ADMIN" },
    issues: [{ number: 1, title: "Issue", state: "OPEN", url: "https://github.com/owner/repo/issues/1", labels: [{ name: "bug" }] }],
    pulls: [{ number: 2, title: "PR", state: "OPEN", isDraft: true, headRefName: "feature", baseRefName: "main", reviewDecision: "REVIEW_REQUIRED", statusCheckRollup: [{ name: "CI", status: "COMPLETED", conclusion: "SUCCESS" }] }],
    runs: [{ databaseId: 3, displayTitle: "CI", workflowName: "Build", status: "completed", conclusion: "success", url: "https://github.com/owner/repo/actions/runs/3" }],
    currentPull: { number: 2, title: "PR", reviews: [{ author: { login: "reviewer" }, state: "APPROVED", body: "Looks good" }] },
    reviewComments: [{ id: 4, user: { login: "reviewer" }, path: "src/app.js", line: 4, body: "Please test this", html_url: "https://github.com/owner/repo/pull/2#discussion_r4" }],
    protection: { required_status_checks: { contexts: ["CI"] }, required_pull_request_reviews: { required_approving_review_count: 1, require_code_owner_reviews: true }, required_conversation_resolution: { enabled: true } },
  });
  assert.equal(result.repository.visibility, "private");
  assert.equal(result.pulls[0].checks[0].conclusion, "SUCCESS");
  assert.equal(result.reviewComments[0].path, "src/app.js");
  assert.equal(result.protection.available, true);
  assert.deepEqual(result.protection.requiredChecks, ["CI"]);
});

test("GitHub context distinguishes unavailable protection metadata", () => {
  const result = normalizeGitHubContext({
    repository: { nameWithOwner: "owner/repo" },
    protection: { _error: "Resource not accessible by integration" },
  });
  assert.equal(result.protection.available, false);
  assert.equal(result.protection.protected, false);
  assert.match(result.protection.error, /not accessible/);
});

test("GitHub service degrades safely when gh is unavailable", async () => {
  const service = new GitHubService({ runner: async () => { const error = new Error("spawn gh ENOENT"); error.code = "ENOENT"; throw error; } });
  const result = await service.context("/workspace/repo");
  assert.equal(result.available, false);
  assert.match(result.reason, /Install GitHub CLI/);
  assert.deepEqual(result.issues, []);
});

test("GitHub service creates a draft pull request with a private temporary body file", async () => {
  let invocation;
  let bodyFile;
  const service = new GitHubService({
    runner: async (command, args, options) => {
      invocation = { command, args, options };
      bodyFile = args[args.indexOf("--body-file") + 1];
      assert.equal(fs.readFileSync(bodyFile, "utf8"), "Explain the reviewed change.\n");
      assert.equal(fs.statSync(bodyFile).mode & 0o777, 0o600);
      return "https://github.com/owner/repo/pull/42\n";
    },
  });

  const result = await service.createDraftPullRequest("/workspace/repo", {
    title: "  Ship reviewed change  ",
    body: "  Explain the reviewed change.  ",
    base: "main",
    head: "feature/reviewed-change",
  });

  assert.deepEqual(result, { url: "https://github.com/owner/repo/pull/42" });
  assert.equal(invocation.command, "gh");
  assert.deepEqual(invocation.args, [
    "pr", "create", "--draft",
    "--title", "Ship reviewed change",
    "--body-file", bodyFile,
    "--base", "main",
    "--head", "feature/reviewed-change",
  ]);
  assert.deepEqual(invocation.options, { cwd: "/workspace/repo", timeout: 60_000 });
  assert.equal(fs.existsSync(bodyFile), false);
  assert.equal(fs.existsSync(path.dirname(bodyFile)), false);
});

test("GitHub service rejects invalid pull-request branches before invoking gh", async () => {
  let calls = 0;
  const service = new GitHubService({ runner: async () => { calls += 1; } });

  await assert.rejects(
    service.createDraftPullRequest("/workspace/repo", {
      title: "Draft",
      base: "main branch",
      head: "feature/reviewed-change",
    }),
    /base branch is invalid/,
  );
  await assert.rejects(
    service.createDraftPullRequest("/workspace/repo", {
      title: "Draft",
      base: "main",
      head: "--force",
    }),
    /head branch is invalid/,
  );
  assert.equal(calls, 0);
});

test("GitHub service removes the temporary pull-request body after gh fails", async () => {
  let bodyFile;
  const service = new GitHubService({
    runner: async (_command, args) => {
      bodyFile = args[args.indexOf("--body-file") + 1];
      assert.equal(fs.existsSync(bodyFile), true);
      throw new Error("gh failed");
    },
  });

  await assert.rejects(
    service.createDraftPullRequest("/workspace/repo", {
      title: "Draft",
      body: "Body",
      base: "main",
      head: "feature/reviewed-change",
    }),
    /gh failed/,
  );
  assert.equal(fs.existsSync(bodyFile), false);
  assert.equal(fs.existsSync(path.dirname(bodyFile)), false);
});
