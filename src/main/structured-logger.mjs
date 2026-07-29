import fs from "node:fs";
import path from "node:path";

const sensitiveKey = /authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|password|secret|cookie|session[-_]?token|private[-_]?key|client[-_]?secret/i;

export function redact(value, key = "") {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (typeof value === "string") return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED_API_KEY]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/([?&](?:access_token|refresh_token|api_key|code)=)[^&\s]+/gi, "$1[REDACTED]");
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
  return value;
}

export class StructuredLogger {
  constructor(filePath, { maxBytes = 1_000_000, memoryLimit = 250, fsApi = fs } = {}) {
    this.filePath = filePath;
    this.maxBytes = maxBytes;
    this.memoryLimit = memoryLimit;
    this.fs = fsApi;
    this.entries = [];
    this.fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  log(level, event, details = {}) {
    const entry = redact({ timestamp: new Date().toISOString(), level, event, ...details });
    this.entries.push(entry);
    if (this.entries.length > this.memoryLimit) this.entries.splice(0, this.entries.length - this.memoryLimit);
    try {
      this.rotateIfNeeded();
      this.fs.appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    } catch (error) {
      console.error("Failed to write application log", error);
    }
    return entry;
  }

  rotateIfNeeded() {
    let size = 0;
    try { size = this.fs.statSync(this.filePath).size; } catch {}
    if (size < this.maxBytes) return;
    const rotated = `${this.filePath}.1`;
    try { this.fs.rmSync(rotated, { force: true }); } catch {}
    this.fs.renameSync(this.filePath, rotated);
  }

  recent(limit = 100) { return this.entries.slice(-Math.max(0, limit)); }
}
