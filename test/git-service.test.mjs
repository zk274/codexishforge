import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GitService, parsePorcelainStatus } from "../src/main/git-service.mjs";

function repository() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "codex-linux-git-"));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  git("init", "-q");
  git("config", "user.name", "Codex Linux Test");
  git("config", "user.email", "test@example.invalid");
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "first\n");
  git("add", "tracked.txt");
  git("commit", "-qm", "initial");
  return { cwd, git };
}

test("parsePorcelainStatus handles spaces and rename records", () => {
  const entries = parsePorcelainStatus(" M file with spaces.txt\0R  renamed.txt\0old.txt\0?? new.txt\0");
  assert.deepEqual(entries.map(({ path, originalPath, staged, unstaged, untracked }) => ({ path, originalPath, staged, unstaged, untracked })), [
    { path: "file with spaces.txt", originalPath: null, staged: false, unstaged: true, untracked: false },
    { path: "renamed.txt", originalPath: "old.txt", staged: true, unstaged: false, untracked: false },
    { path: "new.txt", originalPath: null, staged: false, unstaged: true, untracked: true },
  ]);
});

test("GitService stages, diffs, unstages, discards, and commits", async (t) => {
  const { cwd, git } = repository();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const service = new GitService();
  fs.appendFileSync(path.join(cwd, "tracked.txt"), "second\n");
  fs.writeFileSync(path.join(cwd, "new file.txt"), "new\n");

  let status = await service.status(cwd);
  assert.deepEqual(status.entries.map((entry) => entry.path).sort(), ["new file.txt", "tracked.txt"]);
  assert.match(await service.diff(cwd, { file: "new file.txt" }), /new file\.txt/);

  status = await service.stage(cwd, ["tracked.txt", "new file.txt"]);
  assert.equal(status.entries.every((entry) => entry.staged), true);
  assert.match(await service.diff(cwd, { staged: true, file: "tracked.txt" }), /\+second/);

  status = await service.unstage(cwd, ["new file.txt"]);
  assert.equal(status.entries.find((entry) => entry.path === "new file.txt").untracked, true);
  await service.discard(cwd, ["new file.txt"]);
  assert.equal(fs.existsSync(path.join(cwd, "new file.txt")), false);

  fs.appendFileSync(path.join(cwd, "tracked.txt"), "discard me\n");
  await service.discard(cwd, ["tracked.txt"]);
  assert.equal(fs.readFileSync(path.join(cwd, "tracked.txt"), "utf8"), "first\nsecond\n");
  assert.match(await service.diff(cwd, { staged: true, file: "tracked.txt" }), /\+second/);

  const result = await service.commit(cwd, "Update tracked file");
  assert.match(result.output, /Update tracked file/);
  assert.equal(git("log", "-1", "--pretty=%s").trim(), "Update tracked file");
});

test("GitService rejects unsafe repository and file paths", async () => {
  const service = new GitService();
  await assert.rejects(service.status("relative"), /absolute/);
  const { cwd } = repository();
  try {
    await assert.rejects(service.stage(cwd, ["/etc/passwd"]), /relative/);
    await assert.rejects(service.stage(cwd, ["../outside"]), /relative/);
  }
  finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test("GitService unstages files before the first commit", async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "codex-linux-git-unborn-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  execFileSync("git", ["-C", cwd, "init", "-q"]);
  fs.writeFileSync(path.join(cwd, "first.txt"), "first\n");
  const service = new GitService();
  await service.stage(cwd, ["first.txt"]);
  const status = await service.unstage(cwd, ["first.txt"]);
  assert.equal(status.entries[0].untracked, true);
});

test("GitService creates detached worktrees only inside the managed root", async (t) => {
  const { cwd } = repository();
  const managedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-linux-worktrees-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  t.after(() => fs.rmSync(managedRoot, { recursive: true, force: true }));
  const service = new GitService();
  const destination = path.join(managedRoot, "task-1");
  const result = await service.createDetachedWorktree(cwd, destination, { ref: "HEAD", allowedRoot: managedRoot });
  assert.equal(result.repository, cwd);
  assert.equal(result.path, destination);
  assert.equal(fs.readFileSync(path.join(destination, "tracked.txt"), "utf8"), "first\n");
  assert.equal(execFileSync("git", ["-C", destination, "branch", "--show-current"], { encoding: "utf8" }).trim(), "");

  await assert.rejects(
    service.createDetachedWorktree(cwd, path.join(managedRoot, "..", "outside"), { ref: "HEAD", allowedRoot: managedRoot }),
    /inside the managed worktree root/,
  );
  await assert.rejects(
    service.createDetachedWorktree(cwd, path.join(managedRoot, "unsafe-ref"), { ref: "--help", allowedRoot: managedRoot }),
    /starting revision is invalid/,
  );
});

test("GitService stages and rejects regenerated review hunks independently", async (t) => {
  const { cwd, git } = repository();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const service = new GitService();
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "first\naccepted\nmiddle\nrejected\n");

  let review = await service.review(cwd);
  assert.equal(review.counts.workingHunks, 1);
  const combined = review.working[0].hunks[0];
  review = await service.decideHunk(cwd, combined.id, "stage");
  assert.equal(review.counts.workingHunks, 0);
  assert.equal(review.counts.stagedHunks, 1);
  await service.unstage(cwd, ["tracked.txt"]);

  fs.writeFileSync(path.join(cwd, "tracked.txt"), "first\n");
  fs.appendFileSync(path.join(cwd, "tracked.txt"), "discard this\n");
  review = await service.review(cwd);
  await service.decideHunk(cwd, review.working[0].hunks[0].id, "reject");
  assert.equal(fs.readFileSync(path.join(cwd, "tracked.txt"), "utf8"), "first\n");
  assert.equal(git("status", "--porcelain").trim(), "");
});

test("GitService creates a branch and pushes without force", async (t) => {
  const { cwd, git } = repository();
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), "codex-linux-remote-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  t.after(() => fs.rmSync(remote, { recursive: true, force: true }));
  execFileSync("git", ["init", "--bare", "-q", remote]);
  git("remote", "add", "origin", remote);
  const service = new GitService();
  const branched = await service.createBranch(cwd, "agent/review-mode");
  assert.equal(branched.branch, "agent/review-mode");
  const pushed = await service.push(cwd);
  assert.equal(pushed.upstream, "origin/agent/review-mode");
  assert.equal(execFileSync("git", ["--git-dir", remote, "rev-parse", "refs/heads/agent/review-mode"], { encoding: "utf8" }).trim(), git("rev-parse", "HEAD").trim());
  await assert.rejects(service.createBranch(cwd, "--unsafe"), /branch name is invalid/);
});
