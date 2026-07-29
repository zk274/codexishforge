import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MAX_DIFF_BYTES = 8 * 1024 * 1024;
const MAX_CHECK_OUTPUT = 80_000;
const CHECK_TIMEOUT_MS = 10 * 60_000;

function bounded(value, limit, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
}

function hunkId(patch) {
  return createHash("sha256").update(patch).digest("hex").slice(0, 24);
}

function diffPath(header, marker) {
  const line = header.find((candidate) => candidate.startsWith(marker));
  if (!line) return null;
  const value = line.slice(marker.length).split("\t", 1)[0];
  if (value === "/dev/null") return null;
  return value.startsWith("a/") || value.startsWith("b/") ? value.slice(2) : value;
}

function fileName(header) {
  return diffPath(header, "+++ ") || diffPath(header, "--- ") || "unknown";
}

function hunkStats(lines) {
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }
  return { additions, deletions };
}

export function parseUnifiedDiff(raw, { staged = false } = {}) {
  if (typeof raw !== "string") throw new TypeError("Diff must be text");
  if (Buffer.byteLength(raw, "utf8") > MAX_DIFF_BYTES) throw new Error("Diff is too large to review safely");
  if (!raw.trim()) return [];
  const lines = (raw.endsWith("\n") ? raw.slice(0, -1) : raw).split("\n");
  const files = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].startsWith("diff --git ")) {
      index += 1;
      continue;
    }
    const header = [];
    const start = index;
    while (index < lines.length && !lines[index].startsWith("@@ ") && (index === start || !lines[index].startsWith("diff --git "))) {
      header.push(lines[index]);
      index += 1;
    }
    const pathName = fileName(header);
    const hunks = [];
    while (index < lines.length && !lines[index].startsWith("diff --git ")) {
      if (!lines[index].startsWith("@@ ")) {
        index += 1;
        continue;
      }
      const hunkLines = [];
      while (index < lines.length && (hunkLines.length === 0 || (!lines[index].startsWith("@@ ") && !lines[index].startsWith("diff --git ")))) {
        hunkLines.push(lines[index]);
        index += 1;
      }
      const patch = `${[...header, ...hunkLines].join("\n")}\n`;
      hunks.push({
        id: hunkId(patch),
        file: pathName,
        staged,
        header: hunkLines[0],
        patch,
        lines: hunkLines,
        ...hunkStats(hunkLines),
      });
    }
    const additions = hunks.reduce((total, hunk) => total + hunk.additions, 0);
    const deletions = hunks.reduce((total, hunk) => total + hunk.deletions, 0);
    files.push({
      path: pathName,
      staged,
      binary: header.some((line) => line.startsWith("Binary files ") || line === "GIT binary patch"),
      newFile: header.some((line) => line.startsWith("new file mode ") || line === "--- /dev/null"),
      deletedFile: header.some((line) => line.startsWith("deleted file mode ") || line === "+++ /dev/null"),
      additions,
      deletions,
      hunks,
    });
  }
  return files;
}

export function reviewSummary({ status, workingDiff = "", stagedDiff = "", evidence = [] } = {}) {
  const working = parseUnifiedDiff(workingDiff);
  const staged = parseUnifiedDiff(stagedDiff, { staged: true });
  const allHunks = [...working.flatMap((file) => file.hunks), ...staged.flatMap((file) => file.hunks)];
  return {
    repository: status?.root || null,
    branch: status?.branch || "detached",
    upstream: status?.upstream || null,
    ahead: status?.ahead || 0,
    behind: status?.behind || 0,
    working,
    staged,
    counts: {
      files: new Set([...working, ...staged].map((file) => file.path)).size,
      workingHunks: working.reduce((total, file) => total + file.hunks.length, 0),
      stagedHunks: staged.reduce((total, file) => total + file.hunks.length, 0),
      additions: allHunks.reduce((total, hunk) => total + hunk.additions, 0),
      deletions: allHunks.reduce((total, hunk) => total + hunk.deletions, 0),
      untracked: (status?.entries || []).filter((entry) => entry.untracked).length,
    },
    evidence: evidence.slice(-20).map((entry) => ({ ...entry, output: bounded(entry.output, MAX_CHECK_OUTPUT) })),
  };
}

function packageChecks(cwd) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
    const scripts = packageJson.scripts && typeof packageJson.scripts === "object" ? packageJson.scripts : {};
    const preferred = ["check", "test", "lint", "typecheck", "build"];
    return preferred.filter((name) => typeof scripts[name] === "string").map((name) => ({
      id: `npm:${name}`,
      label: `npm run ${name}`,
      command: "npm",
      args: ["run", name],
    }));
  } catch {
    return [];
  }
}

export function discoverReviewChecks(cwd) {
  if (typeof cwd !== "string" || !path.isAbsolute(cwd)) throw new TypeError("Review directory must be absolute");
  const checks = packageChecks(cwd);
  if (fs.existsSync(path.join(cwd, "Cargo.toml"))) checks.push({ id: "cargo:test", label: "cargo test", command: "cargo", args: ["test"] });
  if (fs.existsSync(path.join(cwd, "go.mod"))) checks.push({ id: "go:test", label: "go test ./...", command: "go", args: ["test", "./..."] });
  if (fs.existsSync(path.join(cwd, "pyproject.toml")) || fs.existsSync(path.join(cwd, "pytest.ini"))) checks.push({ id: "python:pytest", label: "python -m pytest", command: "python3", args: ["-m", "pytest"] });
  return checks.slice(0, 8);
}

function runProcess(command, args, { cwd, timeoutMs = CHECK_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let output = "";
    let settled = false;
    const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    const append = (chunk) => {
      output = `${output}${chunk.toString("utf8")}`;
      if (output.length > MAX_CHECK_OUTPUT) output = output.slice(-MAX_CHECK_OUTPUT);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    timer.unref();
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ...result,
        output: output.trim(),
        durationMs: Date.now() - startedAt,
        completedAt: Date.now(),
      });
    };
    child.once("error", (error) => finish({ passed: false, exitCode: null, error: bounded(error.message, 500, "Check failed to start") }));
    child.once("exit", (code, signal) => finish({
      passed: code === 0,
      exitCode: Number.isInteger(code) ? code : null,
      error: signal ? `Check stopped by ${signal}` : null,
    }));
  });
}

export async function runReviewCheck(cwd, checkId, options = {}) {
  const check = discoverReviewChecks(cwd).find((candidate) => candidate.id === checkId);
  if (!check) throw new Error("That review check is not available for this repository");
  const result = await (options.runner || runProcess)(check.command, check.args, { cwd, timeoutMs: options.timeoutMs });
  return { id: `${check.id}:${Date.now()}`, checkId: check.id, label: check.label, ...result };
}

export function executeWithInput(command, args, input, { cwd, timeout = 30_000, maxBuffer = 2 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, { cwd, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => child.kill("SIGTERM"), timeout);
    timer.unref();
    const append = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      return next.length > maxBuffer ? next.slice(-maxBuffer) : next;
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `Command failed (${signal || code || "unknown"})`));
    });
    child.stdin.end(input);
  });
}
