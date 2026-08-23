import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { releaseArtifactFile, releaseChannelForVersion } from "./release-trust-lib.mjs";
import { classicSnapLauncher } from "./snap-launcher.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const distDirectory = path.join(projectRoot, "dist");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
if (process.env.GITHUB_REF_TYPE === "tag") {
  assert.equal(process.env.GITHUB_REF_NAME, `v${packageJson.version}`, "Git tag does not match package.json version");
}
const architecture = {
  x64: { appImage: "x86_64", deb: "amd64", snap: "amd64" },
  arm64: { appImage: "arm64", deb: "arm64", snap: "arm64" },
}[process.arch];

assert.ok(architecture, `Release verification does not support ${process.arch}`);

const artifacts = {
  appImage: path.join(distDirectory, releaseArtifactFile(packageJson, architecture.appImage, "AppImage")),
  deb: path.join(distDirectory, releaseArtifactFile(packageJson, architecture.deb, "deb")),
  snap: path.join(distDirectory, releaseArtifactFile(packageJson, architecture.snap, "snap")),
};

function requireArtifact(filePath) {
  const stats = fs.statSync(filePath);
  assert.ok(stats.isFile(), `${path.basename(filePath)} is not a file`);
  assert.ok(stats.size > 10 * 1024 * 1024, `${path.basename(filePath)} is unexpectedly small`);
  return stats;
}

function command(commandName, args) {
  return execFileSync(commandName, args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function sha512(filePath) {
  const hash = createHash("sha512");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("base64");
}

const stats = Object.fromEntries(Object.entries(artifacts).map(([kind, filePath]) => [kind, requireArtifact(filePath)]));

const appImageHeader = Buffer.alloc(4);
const appImage = fs.openSync(artifacts.appImage, "r");
try {
  fs.readSync(appImage, appImageHeader, 0, appImageHeader.length, 0);
} finally {
  fs.closeSync(appImage);
}
assert.deepEqual([...appImageHeader], [0x7f, 0x45, 0x4c, 0x46], "AppImage is not an ELF executable");
assert.ok(stats.appImage.mode & 0o111, "AppImage is not executable");

const debFields = command("dpkg-deb", [
  "--show",
  `--showformat=\${Package}\n\${Version}\n\${Architecture}\n\${Conflicts}\n\${Replaces}\n`,
  artifacts.deb,
]).trim().split("\n");
assert.deepEqual(
  debFields,
  [packageJson.name, packageJson.version, architecture.deb, "codex-linux-community", "codex-linux-community"],
  "DEB metadata or package-transition relationships do not match package.json",
);

const debControlDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "codexishforge-deb-control-"));
try {
  command("dpkg-deb", ["--control", artifacts.deb, debControlDirectory]);
  const postInstall = fs.readFileSync(path.join(debControlDirectory, "postinst"), "utf8");
  const postRemove = fs.readFileSync(path.join(debControlDirectory, "postrm"), "utf8");
  assert.match(postInstall, /Alternative: \$legacy_binary/, "DEB post-install must verify the legacy alternative target");
  assert.match(postInstall, /Name=Codex Linux Community/, "DEB post-install must identify the legacy desktop entry");
  assert.match(postInstall, /Exec="\/opt\/Codex Linux Community\/codex-linux-community" %U/, "DEB post-install must identify the legacy desktop executable");
  assert.match(postInstall, /update-alternatives --install '\/usr\/bin\/codexishforge' 'codexishforge' '\/opt\/CodeXishForge\/codexishforge'/);
  assert.match(postRemove, /update-alternatives --remove 'codexishforge' '\/opt\/CodeXishForge\/codexishforge'/);

  const debPayloadDirectory = path.join(debControlDirectory, "payload");
  command("dpkg-deb", ["--extract", artifacts.deb, debPayloadDirectory]);
  const desktopEntry = fs.readFileSync(
    path.join(debPayloadDirectory, "usr", "share", "applications", packageJson.desktopName),
    "utf8",
  );
  assert.match(desktopEntry, /^Name=CodeXishForge$/m);
  assert.match(desktopEntry, /^Exec=\/opt\/CodeXishForge\/codexishforge %U$/m);
  assert.match(desktopEntry, /^Icon=codexishforge$/m);
  assert.match(desktopEntry, /^StartupWMClass=io\.github\.zk274\.codexishforge$/m);
  assert.match(desktopEntry, /^MimeType=.*x-scheme-handler\/codexishforge;/m);
  assert.match(desktopEntry, /^MimeType=.*x-scheme-handler\/codex-linux;/m);
} finally {
  fs.rmSync(debControlDirectory, { recursive: true, force: true });
}

const snapYaml = command("unsquashfs", ["-cat", artifacts.snap, "meta/snap.yaml"]);
for (const expected of [
  `name: ${packageJson.name}`,
  `version: ${packageJson.version}`,
  `confinement: classic`,
  `base: core22`,
  `  - ${architecture.snap}`,
]) assert.ok(snapYaml.includes(expected), `Snap metadata is missing ${JSON.stringify(expected)}`);
const snapLauncher = command("unsquashfs", ["-cat", artifacts.snap, "command.sh"]);
assert.equal(
  snapLauncher,
  classicSnapLauncher(packageJson.name, { desktopName: packageJson.desktopName }),
  "Classic Snap launcher must not depend on missing desktop helper scripts",
);

const channel = releaseChannelForVersion(packageJson.version);
const updateMetadataPath = path.join(distDirectory, `${channel}-linux.yml`);
const updateMetadata = fs.readFileSync(updateMetadataPath, "utf8");
assert.match(updateMetadata, new RegExp(`^version: ${packageJson.version.replaceAll(".", "\\.")}$`, "m"));

const metadataArtifacts = new Map();
for (const match of updateMetadata.matchAll(/  - url: (.+)\n    sha512: (.+)\n    size: (\d+)/g)) {
  metadataArtifacts.set(match[1].trim(), { sha512: match[2].trim(), size: Number(match[3]) });
}

for (const kind of ["appImage", "deb"]) {
  const metadataName = path.basename(artifacts[kind]).replaceAll(" ", "-");
  const metadata = metadataArtifacts.get(metadataName);
  assert.ok(metadata, `${metadataName} is missing from ${path.basename(updateMetadataPath)}`);
  assert.equal(metadata.size, stats[kind].size, `${metadataName} has an incorrect update size`);
  assert.equal(metadata.sha512, await sha512(artifacts[kind]), `${metadataName} has an incorrect update hash`);
}

console.log(JSON.stringify({
  version: packageJson.version,
  channel,
  architecture,
  artifacts: Object.fromEntries(Object.entries(artifacts).map(([kind, filePath]) => [
    kind,
    { file: path.basename(filePath), bytes: stats[kind].size },
  ])),
}, null, 2));
