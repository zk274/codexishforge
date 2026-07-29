import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { TaskStore } from "../src/main/task-service.mjs";

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-linux-tasks-"));
  let timestamp = 1_000;
  let nextId = 1;
  const store = new TaskStore(path.join(root, "tasks.json"), {
    maxConcurrent: options.maxConcurrent || 1,
    now: () => ++timestamp,
    idFactory: () => `id-${nextId++}`,
  });
  return { root, store, filePath: store.filePath, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("durable task queue enforces slots and tracks waiting requests", (t) => {
  const { store, cleanup } = fixture();
  t.after(cleanup);
  const first = store.create({ prompt: "Implement the queue", repository: "/workspace/repo", isolation: "worktree" });
  const second = store.create({ title: "Review", prompt: "Review the result", repository: "/workspace/repo", isolation: "local" });
  assert.equal(store.nextQueued().id, first.id);

  store.prepare(first.id, { cwd: "/state/worktrees/repo-1", worktreePath: "/state/worktrees/repo-1" });
  store.running(first.id, { threadId: "thread-1", turnId: "turn-1" });
  assert.equal(store.nextQueued(), null);
  store.waiting(first.id, "request-1", "question");
  assert.equal(store.find(first.id).state, "waiting");
  assert.equal(store.snapshot().inbox[0].kind, "question");
  assert.equal(store.snapshot().unread, 1);

  store.resolveRequest("request-1");
  assert.equal(store.find(first.id).state, "running");
  assert.equal(store.snapshot().unread, 0);
  store.finish(first.id, {
    id: "turn-1",
    status: "completed",
    items: [{ type: "agentMessage", text: "Queue complete." }],
  });
  assert.equal(store.find(first.id).summary, "Queue complete.");
  assert.equal(store.nextQueued().id, second.id);
});

test("task recovery persists thread ownership across application restarts", (t) => {
  const { store, filePath, cleanup } = fixture({ maxConcurrent: 2 });
  t.after(cleanup);
  const task = store.create({ prompt: "Keep working after restart", repository: "/workspace/repo" });
  store.prepare(task.id, { cwd: "/workspace/repo" });
  store.running(task.id, { threadId: "thread-recovery", turnId: "turn-recovery" });

  const restored = new TaskStore(filePath, { maxConcurrent: 2 });
  assert.equal(restored.find(task.id).state, "running");
  assert.deepEqual(restored.recoverInterrupted(), [task.id]);
  assert.equal(restored.find(task.id).state, "recovering");
  assert.equal(restored.find(task.id).threadId, "thread-recovery");

  const loadedAgain = new TaskStore(filePath, { maxConcurrent: 2 });
  assert.equal(loadedAgain.find(task.id).state, "recovering");
  assert.ok(loadedAgain.find(task.id).events.some((entry) => entry.kind === "recovering"));
});

test("subagent activity records ownership, handoffs, status, and resource usage", (t) => {
  const { store, cleanup } = fixture({ maxConcurrent: 2 });
  t.after(cleanup);
  const task = store.create({ prompt: "Delegate the review", repository: "/workspace/repo" });
  store.prepare(task.id, { cwd: "/workspace/repo" });
  store.running(task.id, { threadId: "thread-parent", turnId: "turn-parent" });
  store.observeItem("thread-parent", {
    id: "collab-1",
    type: "collabAgentToolCall",
    tool: "spawnAgent",
    status: "completed",
    senderThreadId: "thread-parent",
    receiverThreadIds: ["thread-child"],
    agentsStates: { "thread-child": { status: "running", message: "Reviewing tests" } },
    model: "gpt-test",
    reasoningEffort: "high",
  });
  store.observeItem("thread-parent", {
    id: "collab-2",
    type: "collabAgentToolCall",
    tool: "sendInput",
    status: "completed",
    senderThreadId: "thread-parent",
    receiverThreadIds: ["thread-child"],
    agentsStates: { "thread-child": { status: "completed", message: "Review complete" } },
  });
  store.observeAgentThread({
    id: "thread-child",
    parentThreadId: "thread-parent",
    agentNickname: "Reviewer",
    agentRole: "test-review",
    status: { type: "idle" },
  });

  const snapshot = store.snapshot();
  assert.equal(snapshot.limits.active, 1);
  assert.deepEqual(snapshot.tasks[0].agents[0], {
    threadId: "thread-child",
    ownerThreadId: "thread-parent",
    name: "Reviewer",
    role: "test-review",
    status: "completed",
    model: "gpt-test",
    effort: "high",
    message: "Review complete",
    updatedAt: snapshot.tasks[0].agents[0].updatedAt,
  });
  assert.ok(snapshot.tasks[0].events.some((entry) => entry.kind === "agent:spawnAgent"));
  assert.ok(snapshot.tasks[0].events.some((entry) => entry.kind === "agent:sendInput"));
});

test("failed background processes and task results share a dismissible inbox", (t) => {
  const { store, cleanup } = fixture();
  t.after(cleanup);
  const terminal = store.addInbox({ kind: "terminal", title: "Terminal failed", detail: "Exit code 2" });
  assert.equal(store.snapshot().unread, 1);
  store.dismissInbox(terminal.id);
  assert.equal(store.snapshot().unread, 0);

  const task = store.create({ prompt: "Fail safely", repository: "/workspace/repo" });
  store.fail(task.id, new Error("Expected failure"));
  const failed = store.snapshot().inbox.find((item) => item.taskId === task.id);
  assert.equal(failed.kind, "failed");
  assert.match(failed.detail, /Expected failure/);
});

test("local tasks sharing a checkout run serially while isolated tasks can proceed", (t) => {
  const { store, cleanup } = fixture({ maxConcurrent: 2 });
  t.after(cleanup);
  const first = store.create({ prompt: "Edit locally", repository: "/workspace/repo", isolation: "local" });
  const second = store.create({ prompt: "Also edit locally", repository: "/workspace/repo", isolation: "local" });
  const isolated = store.create({ prompt: "Work independently", repository: "/workspace/repo", isolation: "worktree" });

  store.prepare(first.id, { cwd: "/workspace/repo" });
  store.running(first.id, { threadId: "thread-local", turnId: "turn-local" });
  assert.equal(store.nextQueued().id, isolated.id);
  store.cancel(first.id);
  assert.equal(store.nextQueued().id, second.id);
});

test("an interrupted task stops without producing a false failure notification", (t) => {
  const { store, cleanup } = fixture();
  t.after(cleanup);
  const task = store.create({ prompt: "Stop when requested", repository: "/workspace/repo" });
  store.prepare(task.id, { cwd: "/workspace/repo" });
  store.running(task.id, { threadId: "thread-stop", turnId: "turn-stop" });
  store.finish(task.id, { id: "turn-stop", status: "interrupted", items: [] });

  assert.equal(store.find(task.id).state, "cancelled");
  assert.equal(store.snapshot().inbox.length, 0);
});

test("task inputs reject unsafe paths, empty prompts, and unsupported isolation", (t) => {
  const { store, cleanup } = fixture();
  t.after(cleanup);
  assert.throws(() => store.create({ prompt: "", repository: "/workspace/repo" }), /Enter a task/);
  assert.throws(() => store.create({ prompt: "Task", repository: "relative" }), /absolute/);
  assert.throws(() => store.create({ prompt: "Task", repository: "/workspace/repo", isolation: "container" }), /local or worktree/);
});
