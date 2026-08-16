import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  parseReleaseChecksums,
  releaseArtifactFile,
  releaseArtifactStem,
  releaseChannelForVersion,
  releaseLayout,
  verifyReleaseTrust,
  writeReleaseTrust,
} from "../scripts/release-trust-lib.mjs";
import { validateReleaseSbom } from "../scripts/validate-release-sbom.mjs";

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
    expectedSourceCommit: "a".repeat(40),
  });
  assert.equal(verified.sourceCommit, "a".repeat(40));
  assert.equal(verified.subjects.length, 6);
  assert.ok(verified.subjects.includes("release-manifest.json"));
  assert.ok(verified.subjects.includes("release-sbom.cdx.json"));
});

test("release layout uses updater-safe names and maps release candidates to beta", () => {
  assert.equal(releaseArtifactStem(packageJson), "Test-Community-App");
  assert.equal(
    releaseArtifactFile(packageJson, "x86_64", "AppImage"),
    "Test-Community-App-1.0.0-x86_64.AppImage",
  );
  assert.equal(releaseChannelForVersion("1.0.0"), "latest");
  assert.equal(releaseChannelForVersion("1.0.0-beta.1"), "beta");
  assert.equal(releaseChannelForVersion("1.0.0-rc.1"), "beta");
  assert.equal(releaseLayout({ ...packageJson, version: "1.0.0-rc.1" }, "x64").channel, "beta");
  assert.throws(() => releaseChannelForVersion("1.0.0-alpha.1"), /Unsupported release channel/);
});

test("release trust verification rejects a different workflow commit", async (t) => {
  const directory = fixture(t);
  await writeReleaseTrust({
    distDirectory: directory,
    packageJson,
    sbom: sbom(),
    architecture: "x64",
    sourceCommit: "a".repeat(40),
  });
  await assert.rejects(
    verifyReleaseTrust({
      distDirectory: directory,
      packageJson,
      architecture: "x64",
      electronVersion: "43.2.0",
      expectedSourceCommit: "b".repeat(40),
    }),
    /does not match the release workflow commit/,
  );
});

test("final release SBOM validation accepts the packaged runtime and rejects invalid output", async () => {
  const candidate = sbom();
  assert.equal(await validateReleaseSbom(candidate), candidate);
  await assert.rejects(
    validateReleaseSbom({ ...sbom(), bomFormat: "not-cyclonedx" }),
    /Final CycloneDX SBOM validation failed/,
  );
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
  const ciWorkflow = fs.readFileSync(path.join(import.meta.dirname, "..", ".github", "workflows", "ci.yml"), "utf8");
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /attestations: write/);
  assert.match(workflow, /attest-release:\n[\s\S]*?if: \$\{\{ github\.ref_type == 'tag' && github\.event\.repository\.visibility == 'public' \}\}/);
  assert.match(workflow, /uses: actions\/attest@[a-f0-9]{40} # v4/);
  assert.doesNotMatch(workflow, /uses: [^\n]+@v\d+/);
  assert.doesNotMatch(ciWorkflow, /uses: [^\n]+@v\d+/);
  assert.match(workflow, /subject-checksums: dist\/SHA256SUMS/);
  assert.match(workflow, /sbom-path: dist\/release-sbom\.cdx\.json/);
  assert.match(workflow, /github\.event\.repository\.visibility == 'public'/);
  assert.match(workflow, /github\.ref_type == 'tag' && github\.event\.repository\.visibility == 'public'/);
  assert.match(workflow, /dist\/release-provenance\.sigstore\.json/);
  assert.match(workflow, /dist\/release-sbom\.sigstore\.json/);
  assert.match(workflow, /publish-release:/);
  assert.match(workflow, /environment:\s*name: release/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /uses: actions\/download-artifact@[a-f0-9]{40} # v8/);
  assert.match(workflow, /npm run trust:verify/);
  assert.match(workflow, /name: codex-linux-community-\$\{\{ github\.run_id \}\}-\$\{\{ runner\.arch \}\}/);
  assert.match(workflow, /overwrite: true/);
  assert.match(workflow, /name: codex-linux-community-\$\{\{ github\.run_id \}\}-\$\{\{ runner\.arch \}\}-verified[\s\S]*?compression-level: 0[\s\S]*?retention-days: 1/);
  assert.match(workflow, /name: codex-linux-community-\$\{\{ github\.run_id \}\}-\$\{\{ runner\.arch \}\}-attested[\s\S]*?retention-days: 14/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /gh attestation verify/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /--draft/);
  assert.doesNotMatch(workflow, /--clobber/);
  assert.match(workflow, /Refusing to replace any existing release/);
  assert.match(workflow, /release-preflight:\n[\s\S]*?fetch-depth: 0/);
  assert.match(workflow, /name: Verify version, commit, and annotated tag\n\s+run: npm run verify:release-context/);
  assert.match(workflow, /name: Refuse an existing public release before building or signing/);
  assert.match(workflow, /linux-packages:\n[\s\S]*?needs: release-preflight/);
  assert.ok(
    workflow.indexOf("name: Refuse an existing public release before building or signing")
      < workflow.indexOf("name: Run release verification"),
    "existing releases must be refused before package bytes are built or signed",
  );

  const attestationJob = workflow.split("  attest-release:\n", 2)[1].split("\n  publish-release:\n", 1)[0];
  assert.doesNotMatch(attestationJob, /npm (?:ci|run)|node scripts|actions\/checkout/);
});
