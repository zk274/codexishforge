import assert from "node:assert/strict";
import test from "node:test";
import {
  extractDeepLinkArgument,
  parseDeepLink,
} from "../src/main/deep-links.mjs";

test("extracts bounded CodeXishForge and legacy links from Electron arguments", () => {
  assert.equal(
    extractDeepLinkArgument(["electron", ".", "--flag", "codexishforge://thread/abc-123"]),
    "codexishforge://thread/abc-123",
  );
  assert.equal(extractDeepLinkArgument(["electron", ".", "codex-linux://open"]), "codex-linux://open");
  assert.equal(extractDeepLinkArgument(["electron", ".", "https://example.com"]), null);
});

test("parses focus and thread links into minimal actions", () => {
  assert.deepEqual(parseDeepLink("codexishforge://open"), { kind: "open" });
  assert.deepEqual(parseDeepLink("CODEXISHFORGE://OPEN/"), { kind: "open" });
  assert.deepEqual(parseDeepLink("codexishforge://quick-prompt"), { kind: "quickPrompt" });
  assert.deepEqual(parseDeepLink("CODEXISHFORGE://QUICK-PROMPT/"), { kind: "quickPrompt" });
  assert.deepEqual(parseDeepLink("codexishforge://thread/0190d7a8_ab-CD"), {
    kind: "thread",
    threadId: "0190d7a8_ab-CD",
  });
});

test("parses an encoded absolute project directory", () => {
  assert.deepEqual(
    parseDeepLink("codexishforge://project?path=%2Fhome%2Fexample%2FCodex%20Project"),
    { kind: "project", cwd: "/home/example/Codex Project" },
  );
});

test("rejects credentials, fragments, duplicate or unexpected parameters", () => {
  for (const value of [
    "codexishforge://user:pass@open",
    "codexishforge://open#fragment",
    "codexishforge://open?prompt=run%20this",
    "codexishforge://quick-prompt?text=run%20this",
    "codexishforge://project?path=%2Ftmp&path=%2Fhome",
    "codexishforge://project?path=%2Ftmp&prompt=hello",
  ]) assert.throws(() => parseDeepLink(value), { code: "INVALID_DEEP_LINK" });
});

test("rejects unsafe thread identifiers and project paths", () => {
  for (const value of [
    "codexishforge://thread/",
    "codexishforge://thread/abc%2Fdef",
    "codexishforge://thread/..",
    "codexishforge://project?path=relative",
    "codexishforge://project?path=",
  ]) assert.throws(() => parseDeepLink(value), { code: "INVALID_DEEP_LINK" });
});

test("rejects unsupported schemes and routes", () => {
  for (const value of [
    "https://thread/abc",
    "codexishforge://prompt?text=hello",
    "codexishforge://terminal/run",
    "not a URL",
  ]) assert.throws(() => parseDeepLink(value), { code: "INVALID_DEEP_LINK" });
});

test("legacy Codex Linux links remain compatible with every supported route", () => {
  assert.deepEqual(parseDeepLink("codex-linux://open"), { kind: "open" });
  assert.deepEqual(parseDeepLink("codex-linux://quick-prompt"), { kind: "quickPrompt" });
  assert.deepEqual(parseDeepLink("codex-linux://thread/legacy-123"), { kind: "thread", threadId: "legacy-123" });
  assert.deepEqual(parseDeepLink("codex-linux://project?path=%2Ftmp"), { kind: "project", cwd: "/tmp" });
});
