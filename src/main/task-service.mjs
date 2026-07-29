import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const TASK_STATES = new Set(["queued", "preparing", "running", "waiting", "recovering", "completed", "failed", "cancelled"]);
const ACTIVE_STATES = new Set(["preparing", "running", "waiting", "recovering"]);
const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);
const MAX_TASKS = 200;
const MAX_INBOX = 500;
const MAX_EVENTS = 120;

function bounded(value, limit, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
}

function absoluteDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value) || value.includes("\0")) throw new TypeError(`${label} must be an absolute path`);
  return path.normalize(value);
}

function safeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,240}$/.test(value);
}

function clone(value) {
  return structuredClone(value);
}

function event(kind, message, now, details = {}) {
  return { id: randomUUID(), kind, message: bounded(message, 500, kind), at: now, ...details };
}

function taskStateFromTurn(status) {
  if (status === "completed") return "completed";
  if (status === "interrupted") return "cancelled";
  if (status === "failed") return "failed";
  return "running";
}

function normalizedAgentState(value) {
  if (["pendingInit", "running", "interrupted", "completed", "errored", "shutdown", "notFound"].includes(value)) return value;
  return "running";
}

function loadTask(candidate) {
  if (!candidate || !safeId(candidate.id) || !TASK_STATES.has(candidate.state)) return null;
  if (typeof candidate.repository !== "string" || !path.isAbsolute(candidate.repository)) return null;
  const isolation = candidate.isolation === "worktree" ? "worktree" : "local";
  return {
    id: candidate.id,
    title: bounded(candidate.title, 120, "Background task"),
    prompt: bounded(candidate.prompt, 20_000),
    repository: path.normalize(candidate.repository),
    isolation,
    baseRef: bounded(candidate.baseRef, 240, "HEAD"),
    worktreePath: typeof candidate.worktreePath === "string" && path.isAbsolute(candidate.worktreePath) ? path.normalize(candidate.worktreePath) : null,
    cwd: typeof candidate.cwd === "string" && path.isAbsolute(candidate.cwd) ? path.normalize(candidate.cwd) : path.normalize(candidate.repository),
    model: bounded(candidate.model, 200) || null,
    effort: bounded(candidate.effort, 40) || null,
    state: candidate.state,
    threadId: safeId(candidate.threadId) ? candidate.threadId : null,
    turnId: safeId(candidate.turnId) ? candidate.turnId : null,
    createdAt: Number.isFinite(candidate.createdAt) ? candidate.createdAt : Date.now(),
    updatedAt: Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : Date.now(),
    startedAt: Number.isFinite(candidate.startedAt) ? candidate.startedAt : null,
    completedAt: Number.isFinite(candidate.completedAt) ? candidate.completedAt : null,
    error: bounded(candidate.error, 1000) || null,
    summary: bounded(candidate.summary, 2000) || null,
    attempts: Number.isInteger(candidate.attempts) ? Math.max(0, candidate.attempts) : 0,
    pendingRequests: Array.isArray(candidate.pendingRequests) ? candidate.pendingRequests.filter(safeId).slice(0, 50) : [],
    agents: Array.isArray(candidate.agents) ? candidate.agents.filter((agent) => safeId(agent.threadId)).slice(0, 50).map((agent) => ({
      threadId: agent.threadId,
      ownerThreadId: safeId(agent.ownerThreadId) ? agent.ownerThreadId : null,
      name: bounded(agent.name, 100, "Agent"),
      role: bounded(agent.role, 100) || null,
      status: normalizedAgentState(agent.status),
      model: bounded(agent.model, 200) || null,
      effort: bounded(agent.effort, 40) || null,
      message: bounded(agent.message, 500) || null,
      updatedAt: Number.isFinite(agent.updatedAt) ? agent.updatedAt : Date.now(),
    })) : [],
    events: Array.isArray(candidate.events) ? candidate.events.slice(-MAX_EVENTS).map((entry) => ({
      id: safeId(entry.id) ? entry.id : randomUUID(),
      kind: bounded(entry.kind, 80, "activity"),
      message: bounded(entry.message, 500, "Task activity"),
      at: Number.isFinite(entry.at) ? entry.at : Date.now(),
      agentThreadId: safeId(entry.agentThreadId) ? entry.agentThreadId : null,
    })) : [],
  };
}

function loadInbox(candidate) {
  if (!candidate || !safeId(candidate.id)) return null;
  return {
    id: candidate.id,
    kind: ["approval", "question", "completed", "failed", "terminal"].includes(candidate.kind) ? candidate.kind : "failed",
    taskId: safeId(candidate.taskId) ? candidate.taskId : null,
    requestId: safeId(candidate.requestId) ? candidate.requestId : null,
    title: bounded(candidate.title, 160, "Codex activity"),
    detail: bounded(candidate.detail, 600),
    createdAt: Number.isFinite(candidate.createdAt) ? candidate.createdAt : Date.now(),
    resolved: candidate.resolved === true,
  };
}

export class TaskStore {
  constructor(filePath, { maxConcurrent = 2, now = () => Date.now(), idFactory = randomUUID, onChange = null } = {}) {
    if (typeof filePath !== "string" || !path.isAbsolute(filePath)) throw new TypeError("Task storage path must be absolute");
    this.filePath = path.normalize(filePath);
    this.maxConcurrent = Math.max(1, Math.min(8, Number(maxConcurrent) || 2));
    this.now = now;
    this.idFactory = idFactory;
    this.onChange = onChange;
    this.tasks = [];
    this.inbox = [];
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.tasks = (parsed.tasks || []).map(loadTask).filter(Boolean).slice(-MAX_TASKS);
      this.inbox = (parsed.inbox || []).map(loadInbox).filter(Boolean).slice(-MAX_INBOX);
    } catch {
      this.tasks = [];
      this.inbox = [];
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify({ version: 1, tasks: this.tasks, inbox: this.inbox }, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    this.onChange?.(this.snapshot());
  }

  snapshot() {
    const tasks = [...this.tasks].sort((left, right) => right.updatedAt - left.updatedAt);
    const inbox = [...this.inbox].sort((left, right) => right.createdAt - left.createdAt);
    return clone({
      tasks,
      inbox,
      limits: {
        maxConcurrent: this.maxConcurrent,
        active: tasks.filter((task) => ACTIVE_STATES.has(task.state)).length,
        queued: tasks.filter((task) => task.state === "queued").length,
      },
      counts: Object.fromEntries([...TASK_STATES].map((state) => [state, tasks.filter((task) => task.state === state).length])),
      unread: inbox.filter((item) => !item.resolved).length,
    });
  }

  find(id) {
    return this.tasks.find((task) => task.id === id) || null;
  }

  taskForThread(threadId) {
    return safeId(threadId) ? this.tasks.find((task) => task.threadId === threadId) || null : null;
  }

  taskForAgentThread(threadId) {
    return safeId(threadId) ? this.tasks.find((task) => task.agents.some((agent) => agent.threadId === threadId)) || null : null;
  }

  create({ title, prompt, repository, isolation = "worktree", baseRef = "HEAD", model = null, effort = null } = {}) {
    const cleanPrompt = bounded(prompt, 20_000);
    if (!cleanPrompt) throw new TypeError("Enter a task for Codex");
    const repo = absoluteDirectory(repository, "Repository");
    if (!["local", "worktree"].includes(isolation)) throw new TypeError("Choose local or worktree isolation");
    const createdAt = this.now();
    const task = {
      id: this.idFactory(),
      title: bounded(title, 120, cleanPrompt.split(/\r?\n/, 1)[0].slice(0, 80) || "Background task"),
      prompt: cleanPrompt,
      repository: repo,
      isolation,
      baseRef: bounded(baseRef, 240, "HEAD"),
      worktreePath: null,
      cwd: repo,
      model: bounded(model, 200) || null,
      effort: bounded(effort, 40) || null,
      state: "queued",
      threadId: null,
      turnId: null,
      createdAt,
      updatedAt: createdAt,
      startedAt: null,
      completedAt: null,
      error: null,
      summary: null,
      attempts: 0,
      pendingRequests: [],
      agents: [],
      events: [event("queued", "Task added to the background queue.", createdAt)],
    };
    this.tasks.push(task);
    if (this.tasks.length > MAX_TASKS) this.tasks.splice(0, this.tasks.length - MAX_TASKS);
    this.save();
    return clone(task);
  }

  update(id, patch, activity = null) {
    const task = this.find(id);
    if (!task) throw new Error("Task was not found");
    Object.assign(task, patch, { updatedAt: this.now() });
    if (activity) {
      task.events.push(event(activity.kind, activity.message, task.updatedAt, { agentThreadId: activity.agentThreadId || null }));
      task.events = task.events.slice(-MAX_EVENTS);
    }
    this.save();
    return clone(task);
  }

  prepare(id, { cwd, worktreePath = null } = {}) {
    const task = this.find(id);
    if (!task || task.state !== "queued") throw new Error("Only queued tasks can be prepared");
    return this.update(id, {
      state: "preparing",
      cwd: absoluteDirectory(cwd || task.repository, "Task directory"),
      worktreePath: worktreePath ? absoluteDirectory(worktreePath, "Worktree") : null,
      startedAt: task.startedAt || this.now(),
      attempts: task.attempts + 1,
      error: null,
    }, { kind: "preparing", message: task.isolation === "worktree" ? "Creating an isolated Git worktree." : "Preparing the local checkout." });
  }

  running(id, { threadId, turnId = null } = {}) {
    if (!safeId(threadId)) throw new TypeError("Task thread identifier is invalid");
    return this.update(id, {
      state: "running",
      threadId,
      turnId: safeId(turnId) ? turnId : null,
      pendingRequests: [],
      error: null,
      completedAt: null,
    }, { kind: "running", message: "Codex started working on the task." });
  }

  waiting(id, requestId, kind = "approval") {
    const task = this.find(id);
    if (!task || TERMINAL_STATES.has(task.state)) return null;
    const pendingRequests = safeId(requestId) ? [...new Set([...task.pendingRequests, requestId])] : task.pendingRequests;
    this.addInbox({
      kind: kind === "question" ? "question" : "approval",
      taskId: id,
      requestId: safeId(requestId) ? requestId : null,
      title: kind === "question" ? `${task.title} needs input` : `${task.title} needs approval`,
      detail: "Open the request to let the background task continue.",
    }, { save: false });
    return this.update(id, { state: "waiting", pendingRequests }, { kind: "waiting", message: kind === "question" ? "Waiting for your input." : "Waiting for your approval." });
  }

  resolveRequest(requestId) {
    if (!safeId(requestId)) return null;
    const task = this.tasks.find((candidate) => candidate.pendingRequests.includes(requestId));
    for (const item of this.inbox) if (item.requestId === requestId) item.resolved = true;
    if (!task) {
      this.save();
      return null;
    }
    task.pendingRequests = task.pendingRequests.filter((id) => id !== requestId);
    if (!task.pendingRequests.length && task.state === "waiting") task.state = "running";
    task.updatedAt = this.now();
    task.events.push(event("resumed", "The request was answered; Codex can continue.", task.updatedAt));
    task.events = task.events.slice(-MAX_EVENTS);
    this.save();
    return clone(task);
  }

  finish(id, turn) {
    const task = this.find(id);
    if (!task) return null;
    const state = taskStateFromTurn(turn?.status);
    const error = state === "failed" ? bounded(turn?.error?.message || turn?.error, 1000, "The Codex turn failed.") : null;
    const summary = [...(turn?.items || [])].reverse().find((item) => item.type === "agentMessage" && item.text)?.text || null;
    const title = state === "completed" ? `${task.title} completed` : state === "cancelled" ? `${task.title} stopped` : `${task.title} failed`;
    const detail = state === "completed" ? bounded(summary, 600, "The background task is ready to review.") : error || "The background task stopped.";
    if (state !== "cancelled") this.addInbox({ kind: state, taskId: id, title, detail }, { save: false });
    return this.update(id, {
      state,
      turnId: safeId(turn?.id) ? turn.id : task.turnId,
      completedAt: this.now(),
      pendingRequests: [],
      error,
      summary: bounded(summary, 2000) || null,
    }, { kind: state, message: detail });
  }

  fail(id, error) {
    const task = this.find(id);
    if (!task) return null;
    const message = bounded(error?.message || error, 1000, "The background task failed.");
    this.addInbox({ kind: "failed", taskId: id, title: `${task.title} failed`, detail: message }, { save: false });
    return this.update(id, { state: "failed", error: message, completedAt: this.now(), pendingRequests: [] }, { kind: "failed", message });
  }

  cancel(id) {
    const task = this.find(id);
    if (!task || TERMINAL_STATES.has(task.state)) return task ? clone(task) : null;
    return this.update(id, { state: "cancelled", completedAt: this.now(), pendingRequests: [] }, { kind: "cancelled", message: "Task stopped by the user." });
  }

  retry(id) {
    const task = this.find(id);
    if (!task || !TERMINAL_STATES.has(task.state)) throw new Error("Only finished tasks can be retried");
    return this.update(id, {
      state: "queued",
      threadId: null,
      turnId: null,
      completedAt: null,
      error: null,
      summary: null,
      pendingRequests: [],
    }, { kind: "queued", message: "Task queued for another attempt." });
  }

  recoverInterrupted() {
    const recovered = [];
    for (const task of this.tasks) {
      if (!ACTIVE_STATES.has(task.state)) continue;
      task.state = task.threadId ? "recovering" : "queued";
      task.pendingRequests = [];
      task.updatedAt = this.now();
      task.events.push(event("recovering", task.threadId ? "Recovering the Codex thread after restart." : "Returning an incomplete task to the queue.", task.updatedAt));
      task.events = task.events.slice(-MAX_EVENTS);
      recovered.push(task.id);
    }
    if (recovered.length) this.save();
    return recovered;
  }

  nextQueued() {
    const active = this.tasks.filter((task) => ACTIVE_STATES.has(task.state));
    if (active.length >= this.maxConcurrent) return null;
    const task = this.tasks
      .filter((candidate) => candidate.state === "queued")
      .sort((left, right) => left.createdAt - right.createdAt)
      .find((candidate) => candidate.isolation !== "local" || !active.some((running) => (
        running.isolation === "local" && running.repository === candidate.repository
      )));
    return task ? clone(task) : null;
  }

  observeThreadStatus(threadId, status) {
    const task = this.taskForThread(threadId);
    if (!task || TERMINAL_STATES.has(task.state)) return null;
    const flags = Array.isArray(status?.activeFlags) ? status.activeFlags : [];
    const state = flags.some((flag) => ["waitingOnApproval", "waitingOnUserInput"].includes(flag)) ? "waiting"
      : status?.type === "active" ? "running"
        : task.state;
    if (state === task.state) return clone(task);
    return this.update(task.id, { state }, { kind: state, message: state === "waiting" ? "Codex is waiting for a decision." : "Codex resumed work." });
  }

  observeAgentThread(thread) {
    if (!safeId(thread?.id)) return null;
    const task = this.taskForThread(thread.parentThreadId) || this.taskForAgentThread(thread.id);
    if (!task) return null;
    const agents = [...task.agents];
    const existing = agents.find((agent) => agent.threadId === thread.id);
    const status = thread.status?.type === "systemError" ? "errored"
      : thread.status?.type === "active" ? "running"
        : thread.status?.type === "idle" ? "completed"
          : existing?.status || "pendingInit";
    const values = {
      threadId: thread.id,
      ownerThreadId: safeId(thread.parentThreadId) ? thread.parentThreadId : existing?.ownerThreadId || task.threadId,
      name: bounded(thread.agentNickname, 100) || existing?.name || `Agent ${agents.length + 1}`,
      role: bounded(thread.agentRole, 100) || existing?.role || null,
      status,
      model: existing?.model || null,
      effort: existing?.effort || null,
      message: existing?.message || null,
      updatedAt: this.now(),
    };
    if (existing) Object.assign(existing, values);
    else agents.push(values);
    return this.update(task.id, { agents: agents.slice(0, 50) }, {
      kind: "agent:thread",
      message: `${values.name} is ${values.status}.`,
      agentThreadId: thread.id,
    });
  }

  observeAgentStatus(threadId, status) {
    const task = this.taskForAgentThread(threadId);
    if (!task) return null;
    const agents = task.agents.map((agent) => {
      if (agent.threadId !== threadId) return agent;
      const nextStatus = status?.type === "systemError" ? "errored"
        : status?.type === "active" ? "running"
          : status?.type === "idle" ? "completed"
            : agent.status;
      return { ...agent, status: nextStatus, updatedAt: this.now() };
    });
    return this.update(task.id, { agents });
  }

  observeItem(threadId, item) {
    const task = this.taskForThread(threadId);
    if (!task || !item) return null;
    if (item.type === "collabAgentToolCall") {
      const agents = [...task.agents];
      for (const agentThreadId of item.receiverThreadIds || []) {
        if (!safeId(agentThreadId)) continue;
        const existing = agents.find((agent) => agent.threadId === agentThreadId);
        const state = item.agentsStates?.[agentThreadId] || {};
        const values = {
          threadId: agentThreadId,
          ownerThreadId: safeId(item.senderThreadId) ? item.senderThreadId : task.threadId,
          name: existing?.name || `Agent ${agents.length + 1}`,
          role: existing?.role || null,
          status: normalizedAgentState(state.status || (item.status === "failed" ? "errored" : "running")),
          model: bounded(item.model, 200) || existing?.model || null,
          effort: bounded(item.reasoningEffort, 40) || existing?.effort || null,
          message: bounded(state.message, 500) || existing?.message || null,
          updatedAt: this.now(),
        };
        if (existing) Object.assign(existing, values);
        else agents.push(values);
      }
      const action = {
        spawnAgent: "Spawned a subagent.",
        sendInput: "Sent work to a subagent.",
        resumeAgent: "Resumed a subagent.",
        wait: "Waiting for subagent results.",
        closeAgent: "Closed a subagent.",
      }[item.tool] || "Updated subagent activity.";
      return this.update(task.id, { agents: agents.slice(0, 50) }, {
        kind: `agent:${bounded(item.tool, 40, "activity")}`,
        message: item.status === "failed" ? `${action} The operation failed.` : action,
        agentThreadId: safeId(item.receiverThreadIds?.[0]) ? item.receiverThreadIds[0] : null,
      });
    }
    if (item.type === "subAgentActivity" && safeId(item.agentThreadId)) {
      const agents = [...task.agents];
      const existing = agents.find((agent) => agent.threadId === item.agentThreadId);
      const values = {
        threadId: item.agentThreadId,
        ownerThreadId: task.threadId,
        name: existing?.name || path.basename(item.agentPath || "") || `Agent ${agents.length + 1}`,
        role: existing?.role || null,
        status: item.kind === "interrupted" ? "interrupted" : "running",
        model: existing?.model || null,
        effort: existing?.effort || null,
        message: existing?.message || null,
        updatedAt: this.now(),
      };
      if (existing) Object.assign(existing, values);
      else agents.push(values);
      return this.update(task.id, { agents: agents.slice(0, 50) }, {
        kind: `agent:${bounded(item.kind, 40, "activity")}`,
        message: `Subagent ${item.kind || "activity"}.`,
        agentThreadId: item.agentThreadId,
      });
    }
    return clone(task);
  }

  addInbox({ kind, taskId = null, requestId = null, title, detail } = {}, { save = true } = {}) {
    if (requestId && this.inbox.some((item) => item.requestId === requestId)) return null;
    const item = {
      id: this.idFactory(),
      kind: ["approval", "question", "completed", "failed", "terminal"].includes(kind) ? kind : "failed",
      taskId: safeId(taskId) ? taskId : null,
      requestId: safeId(requestId) ? requestId : null,
      title: bounded(title, 160, "Codex activity"),
      detail: bounded(detail, 600),
      createdAt: this.now(),
      resolved: false,
    };
    this.inbox.push(item);
    if (this.inbox.length > MAX_INBOX) this.inbox.splice(0, this.inbox.length - MAX_INBOX);
    if (save) this.save();
    return clone(item);
  }

  dismissInbox(id) {
    const item = this.inbox.find((candidate) => candidate.id === id);
    if (!item) throw new Error("Inbox item was not found");
    item.resolved = true;
    this.save();
    return clone(item);
  }
}
