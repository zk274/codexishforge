import { execFile } from "node:child_process";
import path from "node:path";

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
    const [raw, branch, upstream] = await Promise.all([
      this.run(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
      this.run(cwd, ["branch", "--show-current"]),
      this.run(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], { acceptedExitCodes: [0, 128] }),
    ]);
    let ahead = 0;
    let behind = 0;
    const upstreamName = upstream.trim() || null;
    if (upstreamName) {
      const counts = await this.run(cwd, ["rev-list", "--left-right", "--count", `HEAD...${upstreamName}`]);
      [ahead, behind] = counts.trim().split(/\s+/).map(Number);
    }
    return { branch: branch.trim() || "detached", upstream: upstreamName, ahead: ahead || 0, behind: behind || 0, entries: parsePorcelainStatus(raw) };
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
}
