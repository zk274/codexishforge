import assert from "node:assert/strict";
import test from "node:test";
import { redactedDiagnosticsMarkdown, redactedTaskMarkdown } from "../src/main/share-summary.mjs";

test("shareable diagnostics omit paths, ids, account data, and logs", () => {
  const output = redactedDiagnosticsMarkdown({
    generatedAt: "2026-07-29T00:00:00Z",
    application: { version: "0.7.0", packaged: true, userData: "/home/user/private" },
    system: { platform: "linux", arch: "x64", desktop: "GNOME", sessionType: "wayland" },
    codex: { version: "codex-cli 1.0", connected: true, compatibility: { status: "compatible" }, path: "/secret/codex" },
    activeThread: { id: "thread-secret", project: "safe-project", title: "Secret title" },
    tasks: { counts: { running: 1 }, limits: { active: 1, maxConcurrent: 2 }, unread: 0, storage: "/secret/tasks.json" },
    logs: [{ token: "secret" }],
    account: { email: "private@example.com" },
  });
  assert.match(output, /App: 0\.7\.0/);
  assert.match(output, /Active project: safe-project/);
  assert.doesNotMatch(output, /thread-secret|Secret title|private@example|\/secret|\/home\/user/);
});

test("shareable task summary omits task text and repository details", () => {
  const output = redactedTaskMarkdown({
    limits: { active: 1, maxConcurrent: 2, queued: 1 },
    unread: 2,
    tasks: [{ state: "running", isolation: "worktree", attempts: 1, agents: [{ name: "Secret agent" }], pendingRequests: ["request-secret"], prompt: "API key", title: "Private task", repository: "/private/repo" }],
  });
  assert.match(output, /\| 1 \| running \| worktree \| 1 \| 1 \| 1 \|/);
  assert.doesNotMatch(output, /API key|Private task|Secret agent|request-secret|\/private/);
});
