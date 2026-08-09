import assert from "node:assert/strict";
import test from "node:test";
import {
  extractDeepLinkArgument,
  parseDeepLink,
} from "../src/main/deep-links.mjs";

test("extracts a bounded Codex Linux link from Electron arguments", () => {
  assert.equal(
    extractDeepLinkArgument(["electron", ".", "--flag", "codex-linux://thread/abc-123"]),
    "codex-linux://thread/abc-123",
  );
  assert.equal(extractDeepLinkArgument(["electron", ".", "https://example.com"]), null);
});

test("parses focus and thread links into minimal actions", () => {
  assert.deepEqual(parseDeepLink("codex-linux://open"), { kind: "open" });
  assert.deepEqual(parseDeepLink("CODEX-LINUX://OPEN/"), { kind: "open" });
  assert.deepEqual(parseDeepLink("codex-linux://quick-prompt"), { kind: "quickPrompt" });
  assert.deepEqual(parseDeepLink("CODEX-LINUX://QUICK-PROMPT/"), { kind: "quickPrompt" });
  assert.deepEqual(parseDeepLink("codex-linux://thread/0190d7a8_ab-CD"), {
    kind: "thread",
    threadId: "0190d7a8_ab-CD",
  });
});

test("parses an encoded absolute project directory", () => {
  assert.deepEqual(
    parseDeepLink("codex-linux://project?path=%2Fhome%2Fexample%2FCodex%20Project"),
    { kind: "project", cwd: "/home/example/Codex Project" },
  );
});

test("rejects credentials, fragments, duplicate or unexpected parameters", () => {
  for (const value of [
    "codex-linux://user:pass@open",
    "codex-linux://open#fragment",
    "codex-linux://open?prompt=run%20this",
    "codex-linux://quick-prompt?text=run%20this",
    "codex-linux://project?path=%2Ftmp&path=%2Fhome",
    "codex-linux://project?path=%2Ftmp&prompt=hello",
  ]) assert.throws(() => parseDeepLink(value), { code: "INVALID_DEEP_LINK" });
});

test("rejects unsafe thread identifiers and project paths", () => {
  for (const value of [
    "codex-linux://thread/",
    "codex-linux://thread/abc%2Fdef",
    "codex-linux://thread/..",
    "codex-linux://project?path=relative",
    "codex-linux://project?path=",
  ]) assert.throws(() => parseDeepLink(value), { code: "INVALID_DEEP_LINK" });
});

test("rejects unsupported schemes and routes", () => {
  for (const value of [
    "https://thread/abc",
    "codex-linux://prompt?text=hello",
    "codex-linux://terminal/run",
    "not a URL",
  ]) assert.throws(() => parseDeepLink(value), { code: "INVALID_DEEP_LINK" });
});
