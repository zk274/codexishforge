import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { repositoryPolicySnapshot } from "../src/main/repository-policy.mjs";

test("repository policy inventory reports metadata without reading policy contents", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-linux-policy-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
  fs.mkdirSync(path.join(root, ".custom-hooks"), { recursive: true });
  fs.writeFileSync(path.join(root, "AGENTS.md"), "secret instructions\n");
  fs.writeFileSync(path.join(root, ".github", "workflows", "ci.yml"), "name: CI\n");
  fs.writeFileSync(path.join(root, ".custom-hooks", "pre-commit"), "#!/bin/sh\n");

  const result = repositoryPolicySnapshot(root, {
    hooksPath: ".custom-hooks",
    remote: { protected: true, requiredChecks: ["CI"], requiredReviews: 2, requireCodeOwners: true },
  });
  assert.deepEqual(result.files.map((entry) => entry.kind).sort(), ["Codex guidance", "Git hook", "GitHub Actions workflow"]);
  assert.equal(result.remote.protected, true);
  assert.equal(result.remote.requiredReviews, 2);
  assert.equal(JSON.stringify(result).includes("secret instructions"), false);
});
