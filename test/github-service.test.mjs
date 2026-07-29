import assert from "node:assert/strict";
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
