import os from "node:os";
import path from "node:path";

function line(label, value) {
  return `- ${label}: ${value == null || value === "" ? "unknown" : value}`;
}

function safeVersion(value) {
  return typeof value === "string" ? value.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]").slice(0, 160) : "unknown";
}

export function redactedDiagnosticsMarkdown(report) {
  const project = report?.activeThread?.project ? path.basename(report.activeThread.project) : "none";
  return [
    "# Codex Linux Community diagnostics",
    "",
    line("Generated", report?.generatedAt),
    line("App", safeVersion(report?.application?.version)),
    line("Packaged", Boolean(report?.application?.packaged)),
    line("Platform", `${report?.system?.platform || "unknown"} ${report?.system?.arch || ""}`.trim()),
    line("Desktop", report?.system?.desktop || "unknown"),
    line("Session", report?.system?.sessionType || "unknown"),
    line("Codex CLI", safeVersion(report?.codex?.version)),
    line("Codex connected", Boolean(report?.codex?.connected)),
    line("Protocol", report?.codex?.compatibility?.status || "unknown"),
    line("Active project", project),
    line("Task counts", JSON.stringify(report?.tasks?.counts || {})),
    line("Task slots", `${report?.tasks?.limits?.active || 0}/${report?.tasks?.limits?.maxConcurrent || 0}`),
    line("Unread task items", report?.tasks?.unread || 0),
    "",
    "_Paths, thread identifiers, prompts, task text, logs, account data, and credentials were omitted._",
  ].join("\n");
}

export function redactedTaskMarkdown(snapshot) {
  const tasks = (snapshot?.tasks || []).slice(0, 30);
  const rows = tasks.map((task, index) => {
    const agents = Array.isArray(task.agents) ? task.agents.length : 0;
    const pending = Array.isArray(task.pendingRequests) ? task.pendingRequests.length : 0;
    return `| ${index + 1} | ${task.state || "unknown"} | ${task.isolation || "unknown"} | ${task.attempts || 0} | ${agents} | ${pending} |`;
  });
  return [
    "# Codex Linux Community task summary",
    "",
    line("Generated", new Date().toISOString()),
    line("Active slots", `${snapshot?.limits?.active || 0}/${snapshot?.limits?.maxConcurrent || 0}`),
    line("Queued", snapshot?.limits?.queued || 0),
    line("Unread inbox items", snapshot?.unread || 0),
    "",
    "| Task | State | Isolation | Attempts | Agents | Pending decisions |",
    "|---:|---|---|---:|---:|---:|",
    ...(rows.length ? rows : ["| — | No tasks | — | — | — | — |"]),
    "",
    "_Repository paths, thread identifiers, task titles, prompts, responses, and credentials were omitted._",
  ].join("\n");
}

export function redactHomePath(value, home = os.homedir()) {
  if (typeof value !== "string" || !value) return value;
  return value === home ? "$HOME" : value.startsWith(`${home}${path.sep}`) ? `$HOME${value.slice(home.length)}` : value;
}
