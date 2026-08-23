import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  RELEASE_SBOM_FILE,
  writeReleaseTrust,
} from "./release-trust-lib.mjs";
import { validateReleaseSbom } from "./validate-release-sbom.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const distDirectory = path.join(projectRoot, "dist");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const electronPackage = JSON.parse(fs.readFileSync(path.join(projectRoot, "node_modules", "electron", "package.json"), "utf8"));
const cyclonedxCli = path.join(
  projectRoot,
  "node_modules",
  "@cyclonedx",
  "cyclonedx-npm",
  "bin",
  "cyclonedx-npm-cli.js",
);
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "codexishforge-sbom-"));
const generatedSbomPath = path.join(temporaryDirectory, RELEASE_SBOM_FILE);

function addPackagedElectron(sbom) {
  const reference = `pkg:npm/electron@${electronPackage.version}`;
  const component = {
    type: "framework",
    "bom-ref": reference,
    name: "electron",
    version: electronPackage.version,
    description: electronPackage.description,
    licenses: [{ license: { id: electronPackage.license } }],
    purl: reference,
    properties: [
      {
        name: "io.github.zk274.codexishforge:distribution",
        value: "packaged-runtime",
      },
    ],
  };
  sbom.components ||= [];
  sbom.components = sbom.components.filter((entry) => entry.name !== "electron");
  sbom.components.push(component);
  sbom.components.sort((left, right) => String(left["bom-ref"] || left.name).localeCompare(String(right["bom-ref"] || right.name)));
  const rootReference = sbom.metadata?.component?.["bom-ref"];
  if (rootReference) {
    sbom.dependencies ||= [];
    let rootDependency = sbom.dependencies.find((entry) => entry.ref === rootReference);
    if (!rootDependency) {
      rootDependency = { ref: rootReference, dependsOn: [] };
      sbom.dependencies.push(rootDependency);
    }
    rootDependency.dependsOn ||= [];
    rootDependency.dependsOn = [...new Set([...rootDependency.dependsOn, reference])].sort();
    sbom.dependencies.sort((left, right) => left.ref.localeCompare(right.ref));
  }
  return sbom;
}

try {
  execFileSync(process.execPath, [
    cyclonedxCli,
    "--omit",
    "dev",
    "--package-lock-only",
    "--output-reproducible",
    "--output-format",
    "JSON",
    "--output-file",
    generatedSbomPath,
    "--validate",
    path.join(projectRoot, "package.json"),
  ], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
    timeout: 60_000,
  });
  const sbom = addPackagedElectron(JSON.parse(fs.readFileSync(generatedSbomPath, "utf8")));
  await validateReleaseSbom(sbom);
  const result = await writeReleaseTrust({
    distDirectory,
    packageJson,
    sbom,
    sourceCommit: process.env.GITHUB_SHA || null,
  });
  console.log(JSON.stringify({
    version: packageJson.version,
    sourceCommit: result.manifest.source.commit,
    artifacts: result.manifest.artifacts.map(({ kind, file, bytes, sha256 }) => ({
      kind,
      file,
      bytes,
      sha256,
    })),
    sbom: {
      file: result.manifest.sbom.file,
      components: sbom.components?.length || 0,
      electron: electronPackage.version,
    },
  }, null, 2));
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
