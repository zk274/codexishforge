import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_BUFFER = 4 * 1024 * 1024;

function bounded(value, limit, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function labels(value) {
  return Array.isArray(value) ? value.slice(0, 20).map((entry) => bounded(entry?.name || entry, 80)).filter(Boolean) : [];
}

function users(value) {
  return Array.isArray(value) ? value.slice(0, 20).map((entry) => bounded(entry?.login || entry?.name || entry, 80)).filter(Boolean) : [];
}

export function normalizeGitHubContext({ repository, issues = [], pulls = [], runs = [], currentPull = null, reviewComments = [], protection = null } = {}) {
  const protectionError = bounded(protection?._error, 300) || null;
  return {
    available: true,
    repository: {
      name: bounded(repository?.nameWithOwner, 240, "GitHub repository"),
      url: safeUrl(repository?.url),
      defaultBranch: bounded(repository?.defaultBranchRef?.name, 240, "main"),
      visibility: bounded(repository?.visibility, 40, "unknown").toLowerCase(),
      viewerPermission: bounded(repository?.viewerPermission, 40, "unknown").toLowerCase(),
    },
    issues: issues.slice(0, 20).map((issue) => ({
      number: Number(issue.number),
      title: bounded(issue.title, 240, "Untitled issue"),
      state: bounded(issue.state, 30, "open").toLowerCase(),
      updatedAt: issue.updatedAt || null,
      url: safeUrl(issue.url),
      labels: labels(issue.labels),
      assignees: users(issue.assignees),
    })),
    pulls: pulls.slice(0, 20).map((pull) => ({
      number: Number(pull.number),
      title: bounded(pull.title, 240, "Untitled pull request"),
      state: bounded(pull.state, 30, "open").toLowerCase(),
      draft: pull.isDraft === true,
      head: bounded(pull.headRefName, 240),
      base: bounded(pull.baseRefName, 240),
      reviewDecision: bounded(pull.reviewDecision, 60) || null,
      checks: Array.isArray(pull.statusCheckRollup) ? pull.statusCheckRollup.slice(0, 50).map((check) => ({
        name: bounded(check.name || check.context || check.workflowName, 160, "Check"),
        status: bounded(check.status, 40) || null,
        conclusion: bounded(check.conclusion || check.state, 40) || null,
      })) : [],
      updatedAt: pull.updatedAt || null,
      url: safeUrl(pull.url),
    })),
    runs: runs.slice(0, 20).map((run) => ({
      id: Number(run.databaseId),
      name: bounded(run.displayTitle || run.name || run.workflowName, 240, "Workflow run"),
      workflow: bounded(run.workflowName || run.name, 160) || null,
      status: bounded(run.status, 40, "unknown").toLowerCase(),
      conclusion: bounded(run.conclusion, 40) || null,
      branch: bounded(run.headBranch, 240) || null,
      event: bounded(run.event, 60) || null,
      createdAt: run.createdAt || null,
      url: safeUrl(run.url),
    })),
    currentPull: currentPull ? {
      number: Number(currentPull.number),
      title: bounded(currentPull.title, 240, "Current pull request"),
      body: bounded(currentPull.body, 2_000) || null,
      url: safeUrl(currentPull.url),
      head: bounded(currentPull.headRefName, 240),
      base: bounded(currentPull.baseRefName, 240),
      draft: currentPull.isDraft === true,
      reviewDecision: bounded(currentPull.reviewDecision, 60) || null,
      reviewers: users(currentPull.reviewRequests),
      reviews: Array.isArray(currentPull.reviews) ? currentPull.reviews.slice(-20).map((review) => ({
        author: bounded(review.author?.login, 80, "reviewer"),
        state: bounded(review.state, 40, "commented").toLowerCase(),
        body: bounded(review.body, 1_000) || null,
        submittedAt: review.submittedAt || null,
      })) : [],
    } : null,
    reviewComments: reviewComments.slice(-50).map((comment) => ({
      id: Number(comment.id),
      author: bounded(comment.user?.login, 80, "reviewer"),
      path: bounded(comment.path, 500) || null,
      line: Number.isInteger(comment.line) ? comment.line : null,
      body: bounded(comment.body, 1_500, "Review comment"),
      createdAt: comment.created_at || null,
      url: safeUrl(comment.html_url),
    })),
    protection: {
      available: !protectionError,
      protected: Boolean(protection && !protectionError),
      requiredChecks: Array.isArray(protection?.required_status_checks?.contexts) ? protection.required_status_checks.contexts.slice(0, 50).map((value) => bounded(value, 160)).filter(Boolean) : [],
      requiredReviews: Number(protection?.required_pull_request_reviews?.required_approving_review_count) || 0,
      requireCodeOwners: protection?.required_pull_request_reviews?.require_code_owner_reviews === true,
      requireConversationResolution: protection?.required_conversation_resolution?.enabled === true,
      enforceAdmins: protection?.enforce_admins?.enabled === true,
      error: protectionError,
    },
  };
}

function defaultRunner(command, args, { cwd, timeout = 20_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, encoding: "utf8", timeout, maxBuffer: MAX_BUFFER, env: process.env }, (error, stdout, stderr) => {
      if (error) {
        const wrapped = new Error(stderr?.trim() || error.message);
        wrapped.code = error.code;
        return reject(wrapped);
      }
      resolve(stdout);
    });
  });
}

export class GitHubService {
  constructor({ command = "gh", runner = defaultRunner } = {}) {
    this.command = command;
    this.runner = runner;
  }

  async run(cwd, args, options = {}) {
    if (typeof cwd !== "string" || !path.isAbsolute(cwd)) throw new TypeError("GitHub repository path must be absolute");
    return this.runner(this.command, args, { cwd, ...options });
  }

  async json(cwd, args, options = {}) {
    const output = await this.run(cwd, args, options);
    try { return JSON.parse(output); }
    catch { throw new Error("GitHub CLI returned invalid JSON"); }
  }

  async context(cwd) {
    try {
      const version = bounded(await this.run(cwd, ["--version"], { timeout: 5_000 }), 160, "GitHub CLI");
      await this.run(cwd, ["auth", "status"], { timeout: 10_000 });
      const repository = await this.json(cwd, ["repo", "view", "--json", "nameWithOwner,url,defaultBranchRef,visibility,viewerPermission"]);
      const [issues, pulls, runs, currentPull] = await Promise.all([
        this.json(cwd, ["issue", "list", "--state", "open", "--limit", "12", "--json", "number,title,state,updatedAt,url,labels,assignees"]).catch(() => []),
        this.json(cwd, ["pr", "list", "--state", "open", "--limit", "12", "--json", "number,title,state,isDraft,headRefName,baseRefName,reviewDecision,statusCheckRollup,updatedAt,url"]).catch(() => []),
        this.json(cwd, ["run", "list", "--limit", "12", "--json", "databaseId,name,displayTitle,workflowName,status,conclusion,event,headBranch,createdAt,url"]).catch(() => []),
        this.json(cwd, ["pr", "view", "--json", "number,title,body,url,headRefName,baseRefName,isDraft,reviewDecision,reviewRequests,reviews"]).catch(() => null),
      ]);
      const fullName = repository?.nameWithOwner;
      if (typeof fullName !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) throw new Error("GitHub returned an invalid repository name");
      const branch = repository?.defaultBranchRef?.name || "main";
      const [reviewComments, protection] = await Promise.all([
        currentPull ? this.json(cwd, ["api", `repos/${fullName}/pulls/${currentPull.number}/comments`, "--paginate"]).catch(() => []) : [],
        this.json(cwd, ["api", `repos/${fullName}/branches/${encodeURIComponent(branch)}/protection`]).catch((error) => (
          /branch not protected|HTTP 404/i.test(error.message) ? null : { _error: bounded(error.message, 300, "Branch protection is unavailable") }
        )),
      ]);
      return { ...normalizeGitHubContext({ repository, issues, pulls, runs, currentPull, reviewComments, protection }), cliVersion: version.split("\n", 1)[0] };
    } catch (error) {
      const unavailable = error.code === "ENOENT" || /not found|could not find|executable/i.test(error.message);
      return {
        available: false,
        reason: unavailable ? "Install GitHub CLI to load repository collaboration context." : "Sign in with GitHub CLI to load private repository context.",
        error: bounded(error.message, 400, "GitHub CLI is unavailable"),
        repository: null,
        issues: [],
        pulls: [],
        runs: [],
        currentPull: null,
        reviewComments: [],
        protection: null,
      };
    }
  }

  async createDraftPullRequest(cwd, { title, body, base, head } = {}) {
    const cleanTitle = bounded(title, 240);
    const cleanBody = bounded(body, 20_000);
    if (!cleanTitle) throw new Error("Enter a pull-request title");
    if (typeof base !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/.test(base)) throw new Error("The pull-request base branch is invalid");
    if (typeof head !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/.test(head)) throw new Error("The pull-request head branch is invalid");
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "codexishforge-pr-"));
    const bodyFile = path.join(temporary, "body.md");
    try {
      fs.writeFileSync(bodyFile, `${cleanBody}\n`, { mode: 0o600 });
      const output = await this.run(cwd, ["pr", "create", "--draft", "--title", cleanTitle, "--body-file", bodyFile, "--base", base, "--head", head], { timeout: 60_000 });
      const url = output.split(/\s+/).map(safeUrl).find(Boolean);
      if (!url) throw new Error("GitHub CLI did not return the draft pull-request URL");
      return { url };
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
}
