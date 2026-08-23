import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { releaseArtifactFile, releaseChannelForVersion } from "./release-trust-lib.mjs";
import { patchClassicSnapLauncher, waitForStableArtifact } from "./snap-launcher.mjs";

const builder = path.resolve("node_modules", ".bin", "electron-builder");
const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
const { version } = packageJson;
const channel = releaseChannelForVersion(version);
const releaseType = channel === "beta" ? "prerelease" : "release";
const architecture = {
  x64: { appImage: "x86_64", deb: "amd64", snap: "amd64" },
  arm64: { appImage: "arm64", deb: "arm64", snap: "arm64" },
}[process.arch];
if (!architecture) throw new Error(`Unsupported Linux architecture: ${process.arch}`);
const artifactPath = (architectureName, extension) => path.resolve(
  "dist",
  releaseArtifactFile(packageJson, architectureName, extension),
);
const appImagePath = artifactPath(architecture.appImage, "AppImage");
const debPath = artifactPath(architecture.deb, "deb");
const snapPath = artifactPath(architecture.snap, "snap");

function build(targets) {
  return new Promise((resolve, reject) => {
    const child = spawn(builder, [
      "--linux",
      ...targets,
      "--publish",
      "never",
      `--config.publish.channel=${channel}`,
      `--config.publish.releaseType=${releaseType}`,
    ], { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${targets.join("/")} build failed (${signal || code || "unknown"})`));
    });
  });
}

for (const filePath of [appImagePath, debPath]) fs.rmSync(filePath, { force: true });
await build(["AppImage", "deb"]);
await Promise.all([waitForStableArtifact(appImagePath), waitForStableArtifact(debPath)]);
fs.rmSync(snapPath, { force: true });
await build(["snap"]);
await waitForStableArtifact(snapPath);
await patchClassicSnapLauncher(snapPath, packageJson.name, { desktopName: packageJson.desktopName });
