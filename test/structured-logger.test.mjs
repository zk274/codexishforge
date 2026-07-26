import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StructuredLogger, redact } from "../src/main/structured-logger.mjs";

test("redacts secrets recursively and inside authorization strings", () => {
  const value = redact({ apiKey: "sk-secretvalue12345", nested: { authorization: "Bearer abc.def.ghi" }, message: "token Bearer xyz123456 https://example.test/callback?code=private-code&state=ok" });
  assert.equal(value.apiKey, "[REDACTED]");
  assert.equal(value.nested.authorization, "[REDACTED]");
  assert.equal(value.message, "token Bearer [REDACTED] https://example.test/callback?code=[REDACTED]&state=ok");
});

test("writes JSONL, keeps a bounded tail, and rotates", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-log-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "app.jsonl");
  const logger = new StructuredLogger(filePath, { maxBytes: 90, memoryLimit: 2 });
  logger.log("info", "one", { message: "a".repeat(60) });
  logger.log("warn", "two", { message: "b".repeat(60) });
  logger.log("error", "three", { message: "c".repeat(60) });
  assert.deepEqual(logger.recent().map((entry) => entry.event), ["two", "three"]);
  assert.equal(fs.existsSync(`${filePath}.1`), true);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(filePath, "utf8").trim()));
});
