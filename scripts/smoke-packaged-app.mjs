import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { releaseArtifactFile } from "./release-trust-lib.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const appImageArchitecture = { x64: "x86_64", arm64: "arm64" }[process.arch];
assert.ok(appImageArchitecture, `Packaged smoke testing does not support ${process.arch}`);

const appImagePath = path.join(
  projectRoot,
  "dist",
  releaseArtifactFile(packageJson, appImageArchitecture, "AppImage"),
);
assert.ok(fs.statSync(appImagePath).isFile(), `AppImage not found: ${appImagePath}`);

const xvfbRun = ["/usr/bin/xvfb-run", "/usr/local/bin/xvfb-run"].find((candidate) => fs.existsSync(candidate));
assert.ok(xvfbRun || process.env.DISPLAY, "xvfb-run or an existing X display is required for the packaged launch smoke test");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "codexishforge-package-smoke-"));
const homeDirectory = path.join(temporaryDirectory, "home");
const runtimeDirectory = path.join(temporaryDirectory, "runtime");
const reportPath = path.join(temporaryDirectory, "report.json");
fs.mkdirSync(homeDirectory, { recursive: true });
fs.mkdirSync(runtimeDirectory, { mode: 0o700 });

function run() {
  return new Promise((resolve, reject) => {
    const output = [];
    const appArguments = [
      "--disable-gpu",
      "--no-sandbox",
      `--test-packaged-launch=${reportPath}`,
    ];
    const executable = xvfbRun || appImagePath;
    const args = xvfbRun ? ["-a", appImagePath, ...appArguments] : ["--ozone-platform=x11", ...appArguments];
    const child = spawn(executable, args, {
      cwd: projectRoot,
      env: {
        APPIMAGE_EXTRACT_AND_RUN: "1",
        CI: "1",
        ...(xvfbRun ? {} : {
          DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS,
          DISPLAY: process.env.DISPLAY,
          ...(process.env.XAUTHORITY ? { XAUTHORITY: process.env.XAUTHORITY } : {}),
        }),
        HOME: homeDirectory,
        LANG: "C.UTF-8",
        PATH: "/usr/bin:/bin",
        XDG_CACHE_HOME: path.join(homeDirectory, ".cache"),
        XDG_CONFIG_HOME: path.join(homeDirectory, ".config"),
        XDG_RUNTIME_DIR: runtimeDirectory,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const collect = (chunk) => {
      output.push(chunk.toString());
      if (output.join("").length > 100_000) output.shift();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", reject);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Packaged launch timed out\n${output.join("")}`));
    }, 30_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(output.join(""));
      else reject(new Error(`Packaged launch failed (${signal || code || "unknown"})\n${output.join("")}`));
    });
  });
}

try {
  const output = await run();
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.packaged, true);
  assert.equal(report.version, packageJson.version);
  assert.equal(report.platform, "linux");
  assert.equal(report.arch, process.arch);
  assert.equal(report.renderer?.readyState, "complete");
  assert.equal(report.renderer?.hasComposer, true);
  assert.equal(report.renderer?.hasAuthDialog, true);
  assert.match(report.renderer?.title || "", /CodeXishForge/);
  console.log(JSON.stringify({
    ...report,
    display: xvfbRun ? "xvfb" : "existing-x11",
    output: output.trim().slice(-2000),
  }, null, 2));
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
