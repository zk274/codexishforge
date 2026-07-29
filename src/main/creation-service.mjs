import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_ARTIFACTS = 200;
const MAX_TEMPLATES = 100;
const MAX_ARTIFACT_BODY = 500_000;
const MAX_SEARCH_RESULTS = 80;
const MAX_SEARCH_FILES = 2_000;
const MAX_SEARCH_BYTES = 12 * 1024 * 1024;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".cache", "vendor"]);
const SKIPPED_FILES = /(^|\/)(\.env(?:\.|$)|credentials?|secrets?|.*\.(?:pem|key|p12|pfx))$/i;
const SEARCHABLE_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".cs", ".css", ".go", ".h", ".hpp", ".html", ".java", ".js", ".jsx", ".json",
  ".md", ".mjs", ".cjs", ".php", ".py", ".rb", ".rs", ".sh", ".sql", ".svg", ".toml", ".ts", ".tsx",
  ".txt", ".vue", ".xml", ".yaml", ".yml",
]);

export const BUILTIN_TASK_TEMPLATES = Object.freeze([
  {
    id: "builtin:review",
    name: "Review current changes",
    description: "Audit the working tree for bugs and regressions, then run relevant checks.",
    prompt: "Review the current changes for correctness, regressions, security issues, and missing tests. Run the relevant checks and report evidence before making any additional changes.",
    isolation: "worktree",
    baseRef: "HEAD",
  },
  {
    id: "builtin:fix-tests",
    name: "Fix failing tests",
    description: "Reproduce failures, repair their cause, and verify the complete suite.",
    prompt: "Run the repository test suite, reproduce every failure, fix the underlying causes, and rerun the complete relevant verification. Preserve unrelated behavior.",
    isolation: "worktree",
    baseRef: "HEAD",
  },
  {
    id: "builtin:implement-issue",
    name: "Implement an issue",
    description: "Explore, implement, test, and summarize a scoped repository change.",
    prompt: "Investigate the requested repository change, identify the smallest coherent implementation, make it, add or update tests, and verify the result. Summarize the decisions and remaining risks.",
    isolation: "worktree",
    baseRef: "HEAD",
  },
  {
    id: "builtin:dependency-upgrade",
    name: "Upgrade a dependency",
    description: "Upgrade one dependency while preserving behavior and validating compatibility.",
    prompt: "Upgrade the specified dependency with the smallest behavior-preserving change. Review its migration guidance, update only related code and lockfiles, and run focused plus full verification.",
    isolation: "worktree",
    baseRef: "HEAD",
  },
]);

function bounded(value, limit, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
}

function safeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,240}$/.test(value);
}

function optionalDirectory(value) {
  return typeof value === "string" && path.isAbsolute(value) && !value.includes("\0") ? path.normalize(value) : null;
}

function normalizeTemplate(candidate, { builtin = false, now = Date.now() } = {}) {
  if (!candidate || !safeId(candidate.id)) return null;
  const prompt = bounded(candidate.prompt, 20_000);
  if (!prompt) return null;
  return {
    id: candidate.id,
    name: bounded(candidate.name, 120, "Task template"),
    description: bounded(candidate.description, 300),
    prompt,
    isolation: candidate.isolation === "local" ? "local" : "worktree",
    baseRef: bounded(candidate.baseRef, 240, "HEAD"),
    model: bounded(candidate.model, 200) || null,
    effort: ["low", "medium", "high", "xhigh"].includes(candidate.effort) ? candidate.effort : null,
    builtin,
    createdAt: Number.isFinite(candidate.createdAt) ? candidate.createdAt : now,
    updatedAt: Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : now,
  };
}

function normalizeArtifact(candidate, now = Date.now()) {
  if (!candidate || !safeId(candidate.id)) return null;
  const body = typeof candidate.body === "string" ? candidate.body.slice(0, MAX_ARTIFACT_BODY) : "";
  return {
    id: candidate.id,
    title: bounded(candidate.title, 160, "Untitled artifact"),
    kind: ["plan", "specification", "documentation", "notes"].includes(candidate.kind) ? candidate.kind : "notes",
    body,
    repository: optionalDirectory(candidate.repository),
    createdAt: Number.isFinite(candidate.createdAt) ? candidate.createdAt : now,
    updatedAt: Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : now,
  };
}

function atomicWrite(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

export class CreationStore {
  constructor(filePath, { now = () => Date.now(), idFactory = randomUUID, onChange = null } = {}) {
    if (typeof filePath !== "string" || !path.isAbsolute(filePath)) throw new TypeError("Creation storage path must be absolute");
    this.filePath = path.normalize(filePath);
    this.now = now;
    this.idFactory = idFactory;
    this.onChange = onChange;
    this.templates = [];
    this.artifacts = [];
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.templates = (parsed.templates || []).map((entry) => normalizeTemplate(entry, { now: this.now() })).filter(Boolean).slice(-MAX_TEMPLATES);
      this.artifacts = (parsed.artifacts || []).map((entry) => normalizeArtifact(entry, this.now())).filter(Boolean).slice(-MAX_ARTIFACTS);
    } catch {
      this.templates = [];
      this.artifacts = [];
    }
  }

  save() {
    atomicWrite(this.filePath, { version: 1, templates: this.templates, artifacts: this.artifacts });
    this.onChange?.(this.snapshot());
  }

  snapshot() {
    return structuredClone({
      templates: [
        ...BUILTIN_TASK_TEMPLATES.map((entry) => normalizeTemplate(entry, { builtin: true, now: 0 })),
        ...[...this.templates].sort((left, right) => right.updatedAt - left.updatedAt),
      ],
      artifacts: [...this.artifacts].sort((left, right) => right.updatedAt - left.updatedAt),
    });
  }

  saveTemplate(candidate = {}) {
    const now = this.now();
    const id = safeId(candidate.id) && !candidate.id.startsWith("builtin:") ? candidate.id : this.idFactory();
    const template = normalizeTemplate({ ...candidate, id, updatedAt: now, createdAt: candidate.createdAt || now }, { now });
    if (!template) throw new TypeError("Enter a reusable task prompt");
    const existing = this.templates.findIndex((entry) => entry.id === id);
    if (existing >= 0) this.templates[existing] = template;
    else this.templates.push(template);
    this.templates = this.templates.slice(-MAX_TEMPLATES);
    this.save();
    return structuredClone(template);
  }

  deleteTemplate(id) {
    if (!safeId(id) || id.startsWith("builtin:")) throw new Error("Built-in templates cannot be deleted");
    const before = this.templates.length;
    this.templates = this.templates.filter((entry) => entry.id !== id);
    if (this.templates.length === before) throw new Error("Task template was not found");
    this.save();
    return this.snapshot();
  }

  saveArtifact(candidate = {}) {
    const now = this.now();
    const id = safeId(candidate.id) ? candidate.id : this.idFactory();
    const existing = this.artifacts.find((entry) => entry.id === id);
    const artifact = normalizeArtifact({
      ...candidate,
      id,
      createdAt: existing?.createdAt || candidate.createdAt || now,
      updatedAt: now,
    }, now);
    if (!artifact) throw new TypeError("Artifact is invalid");
    const index = this.artifacts.findIndex((entry) => entry.id === id);
    if (index >= 0) this.artifacts[index] = artifact;
    else this.artifacts.push(artifact);
    this.artifacts = this.artifacts.slice(-MAX_ARTIFACTS);
    this.save();
    return structuredClone(artifact);
  }

  artifact(id) {
    return safeId(id) ? structuredClone(this.artifacts.find((entry) => entry.id === id) || null) : null;
  }

  deleteArtifact(id) {
    if (!safeId(id)) throw new TypeError("Artifact identifier is invalid");
    const before = this.artifacts.length;
    this.artifacts = this.artifacts.filter((entry) => entry.id !== id);
    if (this.artifacts.length === before) throw new Error("Artifact was not found");
    this.save();
    return this.snapshot();
  }
}

function snippet(text, query) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const at = normalized.toLocaleLowerCase().indexOf(query);
  const start = Math.max(0, at - 80);
  const end = Math.min(normalized.length, Math.max(at + query.length + 120, start + 220));
  return `${start ? "…" : ""}${normalized.slice(start, end)}${end < normalized.length ? "…" : ""}`;
}

function matchResult(kind, item, haystack, query, extra = {}) {
  const at = haystack.toLocaleLowerCase().indexOf(query);
  if (at < 0) return null;
  return {
    kind,
    id: bounded(item.id, 240, `${kind}:${extra.title || "result"}`),
    title: bounded(extra.title, 240, "Search result"),
    detail: snippet(haystack, query),
    updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : null,
    ...extra,
  };
}

function searchRepositoryFiles(root, query, limit) {
  if (!root || !path.isAbsolute(root)) return [];
  const results = [];
  const pending = [path.normalize(root)];
  let files = 0, bytes = 0;
  while (pending.length && files < MAX_SEARCH_FILES && bytes < MAX_SEARCH_BYTES && results.length < limit) {
    const directory = pending.pop();
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (results.length >= limit || files >= MAX_SEARCH_FILES || bytes >= MAX_SEARCH_BYTES) break;
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".")) pending.push(absolute);
        continue;
      }
      if (!entry.isFile() || SKIPPED_FILES.test(relative) || !SEARCHABLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      let stat;
      try { stat = fs.statSync(absolute); } catch { continue; }
      if (stat.size > 1_000_000 || stat.size === 0) continue;
      files += 1;
      bytes += stat.size;
      let text;
      try { text = fs.readFileSync(absolute, "utf8"); } catch { continue; }
      const lowerPath = relative.toLocaleLowerCase();
      const lowerText = text.toLocaleLowerCase();
      if (!lowerPath.includes(query) && !lowerText.includes(query)) continue;
      results.push({
        kind: "file",
        id: `file:${relative}`,
        title: relative,
        detail: lowerText.includes(query) ? snippet(text, query) : "File name matches.",
        relativePath: relative,
        repository: root,
        updatedAt: Math.floor(stat.mtimeMs),
      });
    }
  }
  return results;
}

export function searchWorkspace({ query, threads = [], tasks = [], artifacts = [], repository = null, limit = MAX_SEARCH_RESULTS } = {}) {
  const clean = bounded(query, 200).toLocaleLowerCase();
  if (clean.length < 2) throw new TypeError("Enter at least two search characters");
  const boundedLimit = Math.max(1, Math.min(MAX_SEARCH_RESULTS, Number(limit) || MAX_SEARCH_RESULTS));
  const results = [];
  for (const thread of threads.slice(0, 200)) {
    const title = bounded(thread.name || thread.title || thread.preview, 240, "Codex thread");
    const haystack = [title, thread.preview, thread.cwd].filter((value) => typeof value === "string").join("\n");
    const result = matchResult("thread", thread, haystack, clean, { title, threadId: safeId(thread.id) ? thread.id : null, project: thread.cwd ? path.basename(thread.cwd) : null });
    if (result?.threadId) results.push(result);
  }
  for (const task of tasks.slice(0, 200)) {
    const haystack = [task.title, task.prompt, task.summary, task.error, ...(task.events || []).map((entry) => entry.message)].filter((value) => typeof value === "string").join("\n");
    const result = matchResult("task", task, haystack, clean, {
      title: bounded(task.title, 240, "Background task"),
      taskId: safeId(task.id) ? task.id : null,
      threadId: safeId(task.threadId) ? task.threadId : null,
      state: bounded(task.state, 40),
    });
    if (result?.taskId) results.push(result);
  }
  for (const artifact of artifacts.slice(0, MAX_ARTIFACTS)) {
    const haystack = [artifact.title, artifact.kind, artifact.body].filter((value) => typeof value === "string").join("\n");
    const result = matchResult("artifact", artifact, haystack, clean, {
      title: bounded(artifact.title, 240, "Artifact"),
      artifactId: safeId(artifact.id) ? artifact.id : null,
      artifactKind: artifact.kind,
    });
    if (result?.artifactId) results.push(result);
  }
  const remaining = Math.max(0, boundedLimit - results.length);
  if (remaining) results.push(...searchRepositoryFiles(repository, clean, remaining));
  return results
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
    .slice(0, boundedLimit);
}

export function validateRealtimeAudioChunk(candidate) {
  if (!candidate || typeof candidate.data !== "string" || candidate.data.length > 384_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(candidate.data)) throw new TypeError("Realtime audio data is invalid");
  const sampleRate = Number(candidate.sampleRate);
  const numChannels = Number(candidate.numChannels);
  const samplesPerChannel = Number(candidate.samplesPerChannel);
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 96_000) throw new RangeError("Realtime audio sample rate is invalid");
  if (!Number.isInteger(numChannels) || numChannels < 1 || numChannels > 2) throw new RangeError("Realtime audio channel count is invalid");
  if (!Number.isInteger(samplesPerChannel) || samplesPerChannel < 1 || samplesPerChannel > sampleRate * 2) throw new RangeError("Realtime audio sample count is invalid");
  return { data: candidate.data, sampleRate, numChannels, samplesPerChannel };
}
