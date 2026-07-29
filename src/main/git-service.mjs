import { execFile } from "node:child_process";
import path from "node:path";
import { executeWithInput, parseUnifiedDiff, reviewSummary } from "./review-service.mjs";

const MAX_BUFFER = 16 * 1024 * 1024;

function assertRepositoryPath(cwd) {
  if (typeof cwd !== "string" || !path.isAbsolute(cwd)) throw new Error("The repository path must be absolute");
}

function assertPaths(paths) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 200) throw new Error("Choose between 1 and 200 files");
  for (const candidate of paths) {
    const normalized = typeof candidate === "string" ? path.normalize(candidate) : "";
    if (typeof candidate !== "string" || !candidate || path.isAbsolute(candidate) || normalized === ".." || normalized.startsWith(`..${path.sep}`) || candidate.includes("\0")) throw new Error("Git file paths must be relative to the repository");
  }
}

function assertRef(ref) {
  if (typeof ref !== "string" || !ref.trim() || ref.length > 240 || ref.includes("\0") || ref.startsWith("-")) throw new Error("The Git starting revision is invalid");
}

function assertBranch(branch) {
  if (typeof branch !== "string" || !branch.trim() || branch.length > 240 || branch.includes("\0") || branch.startsWith("-") || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch)) {
    throw new Error("The Git branch name is invalid");
  }
}

function assertRemote(remote) {
  if (typeof remote !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(remote)) throw new Error("The Git remote name is invalid");
}

function assertManagedDestination(destination, allowedRoot) {
  if (typeof destination !== "string" || !path.isAbsolute(destination)) throw new Error("The worktree destination must be absolute");
  if (typeof allowedRoot !== "string" || !path.isAbsolute(allowedRoot)) throw new Error("The managed worktree root must be absolute");
  const normalizedRoot = path.resolve(allowedRoot);
  const normalizedDestination = path.resolve(destination);
  const relative = path.relative(normalizedRoot, normalizedDestination);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("The worktree destination must be inside the managed worktree root");
  }
  return normalizedDestination;
}

export function parsePorcelainStatus(raw) {
  const records = raw.split("\0");
  const entries = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.length < 4) continue;
    const code = record.slice(0, 2);
    const entry = {
      path: record.slice(3),
      originalPath: null,
      index: code[0],
      worktree: code[1],
      staged: ![" ", "?", "!"].includes(code[0]),
      unstaged: ![" ", "!"].includes(code[1]),
      untracked: code === "??",
      conflicted: code.includes("U") || ["AA", "DD"].includes(code),
    };
    if (["R", "C"].includes(code[0]) || ["R", "C"].includes(code[1])) entry.originalPath = records[++index] || null;
    entries.push(entry);
  }
  return entries;
}

export class GitService {
  constructor({ timeout = 15_000 } = {}) {
    this.timeout = timeout;
  }

  run(cwd, args, { acceptedExitCodes = [0] } = {}) {
    assertRepositoryPath(cwd);
    return new Promise((resolve, reject) => {
      execFile("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: this.timeout, maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
        if (!error || acceptedExitCodes.includes(error.code)) return resolve(stdout);
        reject(new Error(stderr?.trim() || error.message));
      });
    });
  }

  async status(cwd) {
    const [raw, branch, upstream, root] = await Promise.all([
      this.run(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
      this.run(cwd, ["branch", "--show-current"]),
      this.run(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], { acceptedExitCodes: [0, 128] }),
      this.run(cwd, ["rev-parse", "--show-toplevel"]),
    ]);
    let ahead = 0;
    let behind = 0;
    const upstreamName = upstream.trim() || null;
    if (upstreamName) {
      const counts = await this.run(cwd, ["rev-list", "--left-right", "--count", `HEAD...${upstreamName}`]);
      [ahead, behind] = counts.trim().split(/\s+/).map(Number);
    }
    return { root: path.normalize(root.trim()), branch: branch.trim() || "detached", upstream: upstreamName, ahead: ahead || 0, behind: behind || 0, entries: parsePorcelainStatus(raw) };
  }

  async diff(cwd, { staged = false, file = null } = {}) {
    if (file !== null) assertPaths([file]);
    const args = ["diff", "--no-ext-diff", "--color=never", ...(staged ? ["--cached"] : []), ...(file ? ["--", file] : [])];
    const output = await this.run(cwd, args);
    if (output || staged || !file) return output;
    const status = await this.status(cwd);
    if (!status.entries.some((entry) => entry.path === file && entry.untracked)) return output;
    return this.run(cwd, ["diff", "--no-index", "--no-ext-diff", "--color=never", "--", "/dev/null", file], { acceptedExitCodes: [0, 1] });
  }

  async stage(cwd, paths) {
    assertPaths(paths);
    await this.run(cwd, ["add", "--", ...paths]);
    return this.status(cwd);
  }

  async unstage(cwd, paths) {
    assertPaths(paths);
    const head = await this.run(cwd, ["rev-parse", "--verify", "HEAD"], { acceptedExitCodes: [0, 128] });
    if (head.trim()) await this.run(cwd, ["reset", "-q", "--", ...paths]);
    else await this.run(cwd, ["rm", "--cached", "-q", "--ignore-unmatch", "--", ...paths]);
    return this.status(cwd);
  }

  async discard(cwd, paths) {
    assertPaths(paths);
    const status = await this.status(cwd);
    const selected = status.entries.filter((entry) => paths.includes(entry.path));
    const untracked = selected.filter((entry) => entry.untracked).map((entry) => entry.path);
    const tracked = selected.filter((entry) => !entry.untracked && entry.unstaged).map((entry) => entry.path);
    if (tracked.length) await this.run(cwd, ["restore", "--worktree", "--", ...tracked]);
    if (untracked.length) await this.run(cwd, ["clean", "-f", "--", ...untracked]);
    return this.status(cwd);
  }

  async commit(cwd, message) {
    if (typeof message !== "string" || !message.trim()) throw new Error("Enter a commit message");
    if (message.length > 10_000 || message.includes("\0")) throw new Error("The commit message is too long");
    const output = await this.run(cwd, ["commit", "-m", message.trim()]);
    return { output: output.trim(), status: await this.status(cwd) };
  }

  async createBranch(cwd, branch) {
    assertBranch(branch);
    await this.run(cwd, ["switch", "-c", branch]);
    return this.status(cwd);
  }

  async push(cwd, { remote = "origin" } = {}) {
    assertRemote(remote);
    const status = await this.status(cwd);
    if (status.branch === "detached") throw new Error("Create a branch before pushing");
    await this.run(cwd, ["push", "--set-upstream", remote, status.branch]);
    return this.status(cwd);
  }

  async hooksPath(cwd) {
    return (await this.run(cwd, ["config", "--get", "core.hooksPath"], { acceptedExitCodes: [0, 1] })).trim() || null;
  }

  async review(cwd, { evidence = [] } = {}) {
    const status = await this.status(cwd);
    const [tracked, staged] = await Promise.all([
      this.run(cwd, ["diff", "--no-ext-diff", "--color=never", "--no-renames"]),
      this.run(cwd, ["diff", "--cached", "--no-ext-diff", "--color=never", "--no-renames"]),
    ]);
    const untracked = [];
    for (const entry of status.entries.filter((candidate) => candidate.untracked).slice(0, 200)) {
      untracked.push(await this.diff(cwd, { file: entry.path }));
    }
    return reviewSummary({ status, workingDiff: [tracked, ...untracked].filter(Boolean).join("\n"), stagedDiff: staged, evidence });
  }

  async decideHunk(cwd, hunkId, decision) {
    if (typeof hunkId !== "string" || !/^[a-f0-9]{24}$/.test(hunkId)) throw new Error("The review hunk identifier is invalid");
    if (!["stage", "reject"].includes(decision)) throw new Error("Choose whether to stage or reject the hunk");
    const review = await this.review(cwd);
    const hunk = review.working.flatMap((file) => file.hunks).find((candidate) => candidate.id === hunkId);
    if (!hunk) throw new Error("That hunk changed since the review was loaded. Refresh and try again.");
    if (review.working.find((file) => file.path === hunk.file)?.binary) throw new Error("Binary changes must be reviewed at file level");
    const args = ["apply", "--recount", "--whitespace=nowarn", ...(decision === "stage" ? ["--cached"] : ["--reverse"]), "-"];
    await executeWithInput("git", ["-C", cwd, ...args.slice(0, -1), "--check", "-"], hunk.patch, { cwd, timeout: this.timeout });
    await executeWithInput("git", ["-C", cwd, ...args], hunk.patch, { cwd, timeout: this.timeout });
    return this.review(cwd);
  }

  async repositoryRoot(cwd) {
    const root = (await this.run(cwd, ["rev-parse", "--show-toplevel"])).trim();
    if (!path.isAbsolute(root)) throw new Error("Git did not return an absolute repository root");
    return path.normalize(root);
  }

  async createDetachedWorktree(cwd, destination, { ref = "HEAD", allowedRoot } = {}) {
    const repository = await this.repositoryRoot(cwd);
    const target = assertManagedDestination(destination, allowedRoot);
    assertRef(ref);
    const commit = (await this.run(repository, ["rev-parse", "--verify", `${ref}^{commit}`])).trim();
    if (!/^[0-9a-f]{40,64}$/i.test(commit)) throw new Error("The starting revision did not resolve to a commit");
    await this.run(repository, ["worktree", "add", "--detach", "--", target, commit], { acceptedExitCodes: [0] });
    return { repository, path: target, commit, ref };
  }
}
