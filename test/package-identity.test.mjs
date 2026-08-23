import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { RELEASE_MANIFEST_SCHEMA } from "../scripts/release-trust-lib.mjs";
import {
  APP_ID,
  APP_NAME,
  APP_SHORT_NAME,
  APP_SLUG,
  APP_URL_SCHEME,
} from "../src/shared/app-identity.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const packageLock = JSON.parse(fs.readFileSync(path.join(projectRoot, "package-lock.json"), "utf8"));

test("package and release metadata use the canonical CodeXishForge identity", () => {
  assert.equal(APP_NAME, "CodeXishForge");
  assert.equal(APP_SHORT_NAME, "CXF");
  assert.equal(APP_SLUG, "codexishforge");
  assert.equal(APP_ID, "io.github.zk274.codexishforge");
  assert.equal(APP_URL_SCHEME, "codexishforge");
  assert.equal(packageJson.name, "codexishforge");
  assert.equal(packageLock.name, packageJson.name);
  assert.equal(packageLock.packages[""].name, packageJson.name);
  assert.equal(packageJson.build.productName, "CodeXishForge");
  assert.equal(packageJson.build.appId, "io.github.zk274.codexishforge");
  assert.equal(packageJson.desktopName, "io.github.zk274.codexishforge.desktop");
  assert.equal(packageJson.build.linux.executableName, "codexishforge");
  assert.equal(packageJson.build.linux.artifactName, "CodeXishForge-${version}-${arch}.${ext}");
  assert.equal(packageJson.author.email, "5151318+zk274@users.noreply.github.com");
  assert.equal(packageJson.homepage, "https://github.com/zk274/codexishforge");
  assert.equal(packageJson.repository.url, "https://github.com/zk274/codexishforge.git");
  assert.equal(RELEASE_MANIFEST_SCHEMA, "io.github.zk274.codexishforge.release-manifest.v1");
  assert.deepEqual(packageJson.build.publish, {
    provider: "github",
    owner: "zk274",
    repo: "codexishforge",
    channel: "latest",
    releaseType: "release",
  });
  assert.deepEqual(packageJson.build.protocols, [{
    name: "CodeXishForge link",
    schemes: ["codexishforge", "codex-linux"],
  }]);

  const sbomGenerator = fs.readFileSync(path.join(projectRoot, "scripts", "generate-release-trust.mjs"), "utf8");
  assert.match(sbomGenerator, /io\.github\.zk274\.codexishforge:distribution/);
});

test("public positioning is independent and explicitly non-affiliated", () => {
  const readme = fs.readFileSync(path.join(projectRoot, "README.md"), "utf8");
  const renderer = fs.readFileSync(path.join(projectRoot, "src", "renderer", "index.html"), "utf8");
  assert.match(packageJson.description, /independent, community-built Linux workspace/);
  assert.match(packageJson.build.snapcraft.core22.summary, /independent community-built Linux workspace/);
  assert.match(readme, /CodeXishForge \(\*\*CXF\*\*\)/);
  assert.match(readme, /not an OpenAI product/);
  assert.match(readme, /not an official Codex port/);
  assert.match(readme, /not affiliated with, endorsed by, sponsored by, or maintained by OpenAI/);
  assert.match(renderer, /class="community-pill">independent</);
});

test("Debian metadata explicitly replaces the legacy package", () => {
  assert.deepEqual(packageJson.build.deb.fpm, [
    "--conflicts",
    "codex-linux-community",
    "--replaces",
    "codex-linux-community",
  ]);
});

test("Debian transition hooks are syntactically valid and guard legacy cleanup", () => {
  const afterInstallPath = path.join(projectRoot, packageJson.build.deb.afterInstall);
  const afterRemovePath = path.join(projectRoot, packageJson.build.deb.afterRemove);
  for (const hookPath of [afterInstallPath, afterRemovePath]) {
    const syntax = spawnSync("bash", ["-n", hookPath], { encoding: "utf8" });
    assert.equal(syntax.status, 0, `${path.basename(hookPath)} is invalid:\n${syntax.stderr}`);
  }

  const afterInstall = fs.readFileSync(afterInstallPath, "utf8");
  assert.match(afterInstall, /update-alternatives --query "\$legacy_executable"/);
  assert.match(afterInstall, /grep -Fqx "Alternative: \$legacy_binary"/);
  assert.match(afterInstall, /grep -Fqx 'Name=Codex Linux Community'/);
  assert.match(afterInstall, /grep -Fqx 'Exec="\/opt\/Codex Linux Community\/codex-linux-community" %U'/);
  assert.doesNotMatch(afterInstall, /rm -rf/);

  const afterRemove = fs.readFileSync(afterRemovePath, "utf8");
  assert.doesNotMatch(afterRemove, /codex-linux-community|community\.codexlinux/);
  assert.doesNotMatch(afterRemove, /rm -rf/);
});
