import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { verifyReleaseContext } from "../scripts/verify-release-context.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const packageLock = JSON.parse(fs.readFileSync(path.join(projectRoot, "package-lock.json"), "utf8"));

function releaseEnvironment(overrides = {}) {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_REF_TYPE: "tag",
    GITHUB_REF_NAME: `v${packageJson.version}`,
    GITHUB_SHA: "a".repeat(40),
    ...overrides,
  };
}

const annotatedTag = () => "tag";

test("release context accepts an exact package tag and workflow commit", () => {
  const result = verifyReleaseContext({
    packageJson,
    packageLock,
    environment: releaseEnvironment(),
    resolveTagObjectType: annotatedTag,
  });
  assert.equal(result.expectedTag, `v${packageJson.version}`);
  assert.equal(result.refName, result.expectedTag);
  assert.equal(result.tagObjectType, "tag");
  assert.equal(result.workflowCommit, "a".repeat(40));
});

test("release context rejects a mismatched tag and invalid workflow commit", () => {
  assert.throws(
    () => verifyReleaseContext({
      packageJson,
      packageLock,
      environment: releaseEnvironment({ GITHUB_REF_NAME: "v9.9.9" }),
      resolveTagObjectType: annotatedTag,
    }),
    /Git tag does not match package\.json version/,
  );
  assert.throws(
    () => verifyReleaseContext({
      packageJson,
      packageLock,
      environment: releaseEnvironment({ GITHUB_SHA: "not-a-commit" }),
      resolveTagObjectType: annotatedTag,
    }),
    /GitHub release workflow commit is invalid/,
  );
});

test("release context rejects lightweight or unavailable release tags", () => {
  for (const tagObjectType of ["commit", null]) {
    assert.throws(
      () => verifyReleaseContext({
        packageJson,
        packageLock,
        environment: releaseEnvironment(),
        resolveTagObjectType: () => tagObjectType,
      }),
      /Release tag must exist locally and be annotated/,
    );
  }
});

test("release context rejects a package-lock version mismatch", () => {
  assert.throws(
    () => verifyReleaseContext({
      packageJson,
      packageLock: { ...packageLock, version: "9.9.9" },
      environment: {},
    }),
    /package-lock\.json version does not match package\.json/,
  );
});
