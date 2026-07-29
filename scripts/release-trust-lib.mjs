import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RELEASE_MANIFEST_SCHEMA = "community.codexlinux.release-manifest.v1";
export const RELEASE_MANIFEST_FILE = "release-manifest.json";
export const RELEASE_CHECKSUMS_FILE = "SHA256SUMS";
export const RELEASE_SBOM_FILE = "release-sbom.cdx.json";

function channelForVersion(version) {
  const prerelease = version.split("-", 2)[1] || null;
  const channel = prerelease == null ? "latest" : /^beta(?:[.-]|$)/.test(prerelease) ? "beta" : null;
  assert.ok(channel, `Unsupported release channel in package version: ${version}`);
  return channel;
}

export function releaseLayout(packageJson, architecture = process.arch) {
  const names = {
    x64: { appImage: "x86_64", deb: "amd64", snap: "amd64" },
    arm64: { appImage: "arm64", deb: "arm64", snap: "arm64" },
  }[architecture];
  assert.ok(names, `Release trust metadata does not support ${architecture}`);
  const productName = packageJson.build.productName;
  const version = packageJson.version;
  const channel = channelForVersion(version);
  return {
    architecture,
    channel,
    artifacts: [
      { kind: "appimage", file: `${productName}-${version}-${names.appImage}.AppImage` },
      { kind: "deb", file: `${productName}-${version}-${names.deb}.deb` },
      { kind: "snap", file: `${productName}-${version}-${names.snap}.snap` },
      { kind: "update-metadata", file: `${channel}-linux.yml` },
    ],
  };
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function atomicWrite(filePath, contents) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, contents, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
  fs.chmodSync(filePath, 0o644);
}

function validCommit(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : null;
}

async function descriptor(distDirectory, entry) {
  const filePath = path.join(distDirectory, entry.file);
  const stats = fs.statSync(filePath);
  assert.ok(stats.isFile(), `${entry.file} is not a release file`);
  return {
    ...entry,
    bytes: stats.size,
    sha256: await sha256File(filePath),
  };
}

export async function writeReleaseTrust({
  distDirectory,
  packageJson,
  sbom,
  architecture = process.arch,
  sourceCommit = null,
} = {}) {
  assert.ok(path.isAbsolute(distDirectory), "Distribution directory must be absolute");
  assert.equal(sbom?.bomFormat, "CycloneDX", "Release SBOM must use CycloneDX");
  assert.equal(sbom?.metadata?.component?.name, packageJson.name, "SBOM root component does not match package.json");
  assert.equal(sbom?.metadata?.component?.version, packageJson.version, "SBOM version does not match package.json");
  fs.mkdirSync(distDirectory, { recursive: true });
  const layout = releaseLayout(packageJson, architecture);
  const sbomPath = path.join(distDirectory, RELEASE_SBOM_FILE);
  atomicWrite(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`);

  const artifacts = [];
  for (const entry of layout.artifacts) artifacts.push(await descriptor(distDirectory, entry));
  const sbomDescriptor = await descriptor(distDirectory, {
    kind: "sbom",
    file: RELEASE_SBOM_FILE,
  });
  const manifest = {
    schema: RELEASE_MANIFEST_SCHEMA,
    product: {
      name: packageJson.name,
      displayName: packageJson.build.productName,
      version: packageJson.version,
      appId: packageJson.build.appId,
    },
    source: {
      repository: packageJson.repository.url,
      commit: validCommit(sourceCommit),
      workflow: ".github/workflows/release-gates.yml",
    },
    build: {
      platform: "linux",
      architecture,
      channel: layout.channel,
    },
    artifacts,
    sbom: {
      ...sbomDescriptor,
      format: sbom.bomFormat,
      specVersion: sbom.specVersion,
    },
  };
  const manifestPath = path.join(distDirectory, RELEASE_MANIFEST_FILE);
  atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const subjects = [
    ...artifacts.map(({ file, sha256 }) => ({ file, sha256 })),
    { file: RELEASE_SBOM_FILE, sha256: sbomDescriptor.sha256 },
    { file: RELEASE_MANIFEST_FILE, sha256: await sha256File(manifestPath) },
  ].sort((left, right) => left.file.localeCompare(right.file));
  atomicWrite(
    path.join(distDirectory, RELEASE_CHECKSUMS_FILE),
    `${subjects.map(({ file, sha256 }) => `${sha256}  ${file}`).join("\n")}\n`,
  );
  return { manifest, subjects };
}

export function parseReleaseChecksums(contents) {
  const entries = new Map();
  for (const line of contents.trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})  ([^\r\n]+)$/.exec(line);
    assert.ok(match, `Invalid SHA256SUMS line: ${line}`);
    const file = match[2];
    assert.equal(path.basename(file), file, `Checksum subject must be a plain filename: ${file}`);
    assert.equal(entries.has(file), false, `Duplicate checksum subject: ${file}`);
    entries.set(file, match[1]);
  }
  assert.ok(entries.size > 0, "SHA256SUMS is empty");
  return entries;
}

export async function verifyReleaseTrust({
  distDirectory,
  packageJson,
  architecture = process.arch,
  electronVersion = null,
} = {}) {
  const layout = releaseLayout(packageJson, architecture);
  const checksumsPath = path.join(distDirectory, RELEASE_CHECKSUMS_FILE);
  const checksums = parseReleaseChecksums(fs.readFileSync(checksumsPath, "utf8"));
  const expectedFiles = new Set([
    ...layout.artifacts.map((entry) => entry.file),
    RELEASE_SBOM_FILE,
    RELEASE_MANIFEST_FILE,
  ]);
  assert.deepEqual(new Set(checksums.keys()), expectedFiles, "SHA256SUMS subjects do not match the release set");
  for (const [file, digest] of checksums) {
    assert.equal(await sha256File(path.join(distDirectory, file)), digest, `${file} failed SHA-256 verification`);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(distDirectory, RELEASE_MANIFEST_FILE), "utf8"));
  assert.equal(manifest.schema, RELEASE_MANIFEST_SCHEMA);
  assert.equal(manifest.product.name, packageJson.name);
  assert.equal(manifest.product.displayName, packageJson.build.productName);
  assert.equal(manifest.product.version, packageJson.version);
  assert.equal(manifest.product.appId, packageJson.build.appId);
  assert.equal(manifest.source.repository, packageJson.repository.url);
  assert.ok(manifest.source.commit === null || /^[a-f0-9]{40}$/.test(manifest.source.commit), "Manifest commit is invalid");
  assert.equal(manifest.source.workflow, ".github/workflows/release-gates.yml");
  assert.deepEqual(manifest.build, {
    platform: "linux",
    architecture,
    channel: layout.channel,
  });
  assert.deepEqual(
    manifest.artifacts.map(({ kind, file }) => ({ kind, file })),
    layout.artifacts,
  );
  for (const entry of [...manifest.artifacts, manifest.sbom]) {
    assert.equal(checksums.get(entry.file), entry.sha256, `${entry.file} manifest digest is inconsistent`);
    assert.equal(fs.statSync(path.join(distDirectory, entry.file)).size, entry.bytes, `${entry.file} manifest size is inconsistent`);
  }

  const sbom = JSON.parse(fs.readFileSync(path.join(distDirectory, RELEASE_SBOM_FILE), "utf8"));
  assert.equal(sbom.bomFormat, "CycloneDX");
  assert.equal(sbom.specVersion, manifest.sbom.specVersion);
  assert.equal(sbom.metadata?.component?.name, packageJson.name);
  assert.equal(sbom.metadata?.component?.version, packageJson.version);
  if (electronVersion) {
    const electron = sbom.components?.find((component) => component.name === "electron");
    assert.equal(electron?.version, electronVersion, "SBOM does not identify the packaged Electron runtime");
  }
  return {
    version: packageJson.version,
    architecture,
    channel: layout.channel,
    subjects: [...checksums.keys()],
    sourceCommit: manifest.source.commit,
    sbomComponents: sbom.components?.length || 0,
  };
}
