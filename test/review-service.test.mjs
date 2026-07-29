import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverReviewChecks, parseUnifiedDiff, reviewSummary, runReviewCheck } from "../src/main/review-service.mjs";

const fixture = `diff --git a/src/app.js b/src/app.js
index 1111111..2222222 100644
--- a/src/app.js
+++ b/src/app.js
@@ -1,2 +1,3 @@
 const app = true;
+const reviewed = true;
 export default app;
@@ -10,2 +11,2 @@ function later() {
-  return false;
+  return true;
 }
diff --git a/new file.txt b/new file.txt
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/new file.txt
@@ -0,0 +1 @@
+new
`;

test("parseUnifiedDiff produces stable per-hunk patches and statistics", () => {
  const files = parseUnifiedDiff(fixture);
  assert.equal(files.length, 2);
  assert.equal(files[0].path, "src/app.js");
  assert.equal(files[0].hunks.length, 2);
  assert.deepEqual(files[0].hunks.map(({ additions, deletions }) => ({ additions, deletions })), [
    { additions: 1, deletions: 0 },
    { additions: 1, deletions: 1 },
  ]);
  assert.match(files[0].hunks[0].patch, /^diff --git/m);
  assert.match(files[0].hunks[0].patch, /\+const reviewed/);
  assert.doesNotMatch(files[0].hunks[0].patch, /return true/);
  assert.match(files[0].hunks[0].id, /^[a-f0-9]{24}$/);
  assert.equal(files[1].newFile, true);
  assert.equal(files[1].path, "new file.txt");
});

test("reviewSummary combines working, staged, status, and evidence", () => {
  const result = reviewSummary({
    status: { root: "/repo", branch: "feature", upstream: "origin/feature", ahead: 2, behind: 1, entries: [{ untracked: true }] },
    workingDiff: fixture,
    stagedDiff: fixture.split("diff --git a/new file.txt")[0],
    evidence: [{ id: "one", label: "npm test", passed: true, output: "ok" }],
  });
  assert.deepEqual(result.counts, { files: 2, workingHunks: 3, stagedHunks: 2, additions: 5, deletions: 2, untracked: 1 });
  assert.equal(result.evidence[0].passed, true);
});

test("review checks are discovered from repository files and cannot be invented", async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "codex-linux-review-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { check: "node check.js", test: "node test.js", publish: "never" } }));
  fs.writeFileSync(path.join(cwd, "go.mod"), "module example.invalid/test\n");
  assert.deepEqual(discoverReviewChecks(cwd).map((entry) => entry.id), ["npm:check", "npm:test", "go:test"]);
  await assert.rejects(runReviewCheck(cwd, "npm:publish"), /not available/);

  const evidence = await runReviewCheck(cwd, "npm:test", {
    runner: async (command, args) => ({ passed: true, exitCode: 0, output: `${command} ${args.join(" ")}`, durationMs: 4, completedAt: 10 }),
  });
  assert.equal(evidence.passed, true);
  assert.match(evidence.output, /npm run test/);
});

test("oversized review diffs are rejected", () => {
  assert.throws(() => parseUnifiedDiff("x".repeat(8 * 1024 * 1024 + 1)), /too large/);
});
