import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveCodexCommand, validateCodexCommand } from "../src/main/codex-locator.mjs";

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-locator-"));
  return { home, cleanup: () => fs.rmSync(home, { recursive: true, force: true }) };
}

test("finds Codex bundled with the newest VS Code OpenAI extension", (context) => {
  const { home, cleanup } = fixture();
  context.after(cleanup);
  const older = path.join(home, ".vscode/extensions/openai.chatgpt-1.2.0-linux-x64/bin/linux-x86_64/codex");
  const newest = path.join(home, ".vscode/extensions/openai.chatgpt-2.0.0-linux-x64/bin/linux-x86_64/codex");
  for (const candidate of [older, newest]) { fs.mkdirSync(path.dirname(candidate), { recursive: true }); fs.writeFileSync(candidate, ""); fs.chmodSync(candidate, 0o755); }
  const result = resolveCodexCommand({ home, env: { PATH: "" }, platform: "linux", arch: "x64" });
  assert.equal(result.command, newest);
});

test("configured path takes precedence over PATH", (context) => {
  const { home, cleanup } = fixture();
  context.after(cleanup);
  const configuredPath = path.join(home, "custom-codex");
  const pathCodex = path.join(home, "bin", "codex");
  for (const candidate of [configuredPath, pathCodex]) { fs.mkdirSync(path.dirname(candidate), { recursive: true }); fs.writeFileSync(candidate, ""); fs.chmodSync(candidate, 0o755); }
  const result = resolveCodexCommand({ home, configuredPath, env: { PATH: path.dirname(pathCodex) } });
  assert.equal(result.command, configuredPath);
});

test("rejects a non-executable selection", (context) => {
  const { home, cleanup } = fixture();
  context.after(cleanup);
  const candidate = path.join(home, "codex");
  fs.writeFileSync(candidate, "");
  assert.throws(() => validateCodexCommand(candidate), /not executable/);
});
