import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = path.resolve(import.meta.dirname, "..");

export function readGitTagObjectType(tagName, { cwd = projectRoot, execFile = execFileSync } = {}) {
  try {
    return execFile("git", ["cat-file", "-t", `refs/tags/${tagName}`], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

export function verifyReleaseContext({
  packageJson,
  packageLock,
  environment = process.env,
  resolveTagObjectType = readGitTagObjectType,
} = {}) {
  const expectedTag = `v${packageJson.version}`;
  const refType = environment.GITHUB_REF_TYPE || null;
  const refName = environment.GITHUB_REF_NAME || null;
  const workflowCommit = environment.GITHUB_SHA || null;
  const githubActions = environment.GITHUB_ACTIONS === "true";

  assert.equal(packageLock.version, packageJson.version, "package-lock.json version does not match package.json");
  assert.equal(packageLock.packages?.[""]?.version, packageJson.version, "package-lock.json root package version does not match package.json");

  if (refType === "tag") {
    assert.equal(refName, expectedTag, "Git tag does not match package.json version");
    assert.equal(resolveTagObjectType(refName), "tag", "Release tag must exist locally and be annotated");
  }

  if (githubActions) {
    assert.match(workflowCommit || "", /^[a-f0-9]{40}$/i, "GitHub release workflow commit is invalid");
  }

  return {
    version: packageJson.version,
    expectedTag,
    refType,
    refName,
    tagObjectType: refType === "tag" ? "tag" : null,
    workflowCommit: githubActions ? workflowCommit.toLowerCase() : null,
  };
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(projectRoot, "package-lock.json"), "utf8"));
  console.log(JSON.stringify(verifyReleaseContext({ packageJson, packageLock }), null, 2));
}
