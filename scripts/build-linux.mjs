import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const builder = path.resolve("node_modules", ".bin", "electron-builder");
const { version } = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
const prerelease = version.split("-", 2)[1] || null;
const channel = prerelease == null ? "latest" : /^beta(?:[.-]|$)/.test(prerelease) ? "beta" : null;
if (!channel) throw new Error(`Unsupported release channel in package version: ${version}`);
const releaseType = channel === "beta" ? "prerelease" : "release";

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

await build(["AppImage", "deb"]);
await build(["snap"]);
