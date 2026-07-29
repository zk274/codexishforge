import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { trustedRendererUrl, validateAttachmentPath, validateExternalUrl } from "../src/main/security-policy.mjs";

test("external links require credential-free HTTPS URLs", () => {
  assert.equal(validateExternalUrl("https://example.com/docs").hostname, "example.com");
  assert.throws(() => validateExternalUrl("http://example.com"), /HTTPS/);
  assert.throws(() => validateExternalUrl("https://user:secret@example.com"), /credential-free/);
  assert.throws(() => validateExternalUrl("javascript:alert(1)"), /HTTPS/);
});

test("renderer trust is limited to the two packaged application documents", () => {
  const root = "/opt/app/renderer";
  assert.equal(trustedRendererUrl(pathToFileURL(path.join(root, "index.html")).toString(), root), true);
  assert.equal(trustedRendererUrl(pathToFileURL(path.join(root, "companion.html")).toString(), root), true);
  assert.equal(trustedRendererUrl(pathToFileURL(path.join(root, "other.html")).toString(), root), false);
  assert.equal(trustedRendererUrl("https://example.com", root), false);
});

test("attachments must be bounded regular files rather than symlinks", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-linux-attachment-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "file.txt");
  const linkPath = path.join(directory, "link.txt");
  fs.writeFileSync(filePath, "safe");
  fs.symlinkSync(filePath, linkPath);
  assert.equal(validateAttachmentPath(filePath).realPath, filePath);
  assert.throws(() => validateAttachmentPath(linkPath), /Symbolic links/);
  assert.throws(() => validateAttachmentPath(filePath, { maxBytes: 2 }), /limited/);
});
