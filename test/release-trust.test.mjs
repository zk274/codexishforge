import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  parseReleaseChecksums,
  releaseLayout,
  verifyReleaseTrust,
  writeReleaseTrust,
} from "../scripts/release-trust-lib.mjs";

const packageJson = {
  name: "test-community-app",
  version: "1.0.0",
  repository: { url: "https://github.com/example/test-community-app.git" },
  build: {
    appId: "community.example.test",
    productName: "Test Community App",
  },
};

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-linux-release-trust-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const { file } of releaseLayout(packageJson, "x64").artifacts) {
    fs.writeFileSync(path.join(directory, file), `fixture:${file}\n`);
  }
  return directory;
}

function sbom() {
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    version: 1,
    metadata: {
      component: {
        type: "application",
        name: packageJson.name,
        version: packageJson.version,
      },
    },
    components: [
      {
        type: "framework",
        name: "electron",
        version: "43.2.0",
      },
    ],
  };
}

test("release trust metadata binds every package, update file, SBOM, and manifest", async (t) => {
  const directory = fixture(t);
  await writeReleaseTrust({
    distDirectory: directory,
    packageJson,
    sbom: sbom(),
    architecture: "x64",
    sourceCommit: "A".repeat(40),
  });
  const verified = await verifyReleaseTrust({
    distDirectory: directory,
    packageJson,
    architecture: "x64",
    electronVersion: "43.2.0",
  });
  assert.equal(verified.sourceCommit, "a".repeat(40));
  assert.equal(verified.subjects.length, 6);
  assert.ok(verified.subjects.includes("release-manifest.json"));
  assert.ok(verified.subjects.includes("release-sbom.cdx.json"));
});

test("release trust verification detects tampered packages", async (t) => {
  const directory = fixture(t);
  await writeReleaseTrust({
    distDirectory: directory,
    packageJson,
    sbom: sbom(),
    architecture: "x64",
  });
  const appImage = releaseLayout(packageJson, "x64").artifacts[0].file;
  fs.appendFileSync(path.join(directory, appImage), "tampered\n");
  await assert.rejects(
    verifyReleaseTrust({
      distDirectory: directory,
      packageJson,
      architecture: "x64",
      electronVersion: "43.2.0",
    }),
    /failed SHA-256 verification/,
  );
});

test("checksum parser rejects traversal, malformed digests, and duplicate subjects", () => {
  assert.throws(() => parseReleaseChecksums(`${"a".repeat(64)}  ../package\n`), /plain filename/);
  assert.throws(() => parseReleaseChecksums("not-a-digest  package\n"), /Invalid SHA256SUMS/);
  assert.throws(
    () => parseReleaseChecksums(`${"a".repeat(64)}  package\n${"b".repeat(64)}  package\n`),
    /Duplicate checksum/,
  );
});

test("public release workflow signs the checksum subjects and binds the CycloneDX SBOM", () => {
  const workflow = fs.readFileSync(path.join(import.meta.dirname, "..", ".github", "workflows", "release-gates.yml"), "utf8");
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /attestations: write/);
  assert.match(workflow, /uses: actions\/attest@v4/);
  assert.match(workflow, /subject-checksums: dist\/SHA256SUMS/);
  assert.match(workflow, /sbom-path: dist\/release-sbom\.cdx\.json/);
  assert.match(workflow, /github\.event\.repository\.visibility == 'public'/);
  assert.match(workflow, /dist\/release-provenance\.sigstore\.json/);
  assert.match(workflow, /dist\/release-sbom\.sigstore\.json/);
});
