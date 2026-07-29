import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const fixtureDirectory = path.join(projectRoot, "test", "fixtures", "state-v0.8");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const architectures = {
  x64: { appImage: "x86_64", deb: "amd64" },
  arm64: { appImage: "arm64", deb: "arm64" },
};
const architecture = architectures[process.arch];
assert.ok(architecture, `Packaged upgrade testing does not support ${process.arch}`);

const appImagePath = path.join(
  projectRoot,
  "dist",
  `${packageJson.build.productName}-${packageJson.version}-${architecture.appImage}.AppImage`,
);
const debPath = path.join(
  projectRoot,
  "dist",
  `${packageJson.build.productName}-${packageJson.version}-${architecture.deb}.deb`,
);
assert.ok(fs.statSync(appImagePath).isFile(), `AppImage not found: ${appImagePath}`);
assert.ok(fs.statSync(debPath).isFile(), `Debian package not found: ${debPath}`);

const xvfbRun = ["/usr/bin/xvfb-run", "/usr/local/bin/xvfb-run"].find((candidate) => fs.existsSync(candidate));
assert.ok(xvfbRun || process.env.DISPLAY, "xvfb-run or an existing X display is required for the packaged upgrade test");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-linux-package-upgrade-"));
const extractedDeb = path.join(temporaryDirectory, "deb");
const extraction = spawnSync("dpkg-deb", ["--extract", debPath, extractedDeb], {
  cwd: projectRoot,
  encoding: "utf8",
});
assert.equal(
  extraction.status,
  0,
  `Could not extract the Debian package\n${extraction.stdout || ""}${extraction.stderr || ""}`,
);
const debExecutable = path.join(extractedDeb, "opt", packageJson.build.productName, packageJson.name);
assert.ok(fs.statSync(debExecutable).isFile(), `Extracted Debian executable not found: ${debExecutable}`);

const stateNames = ["settings.json", "tasks.json", "creation.json"];
const authFixture = '{\n  "testOnly": "0.8 CLI authentication stays owned by the CLI"\n}\n';

function json(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function seedHome(label) {
  const root = path.join(temporaryDirectory, label);
  const home = path.join(root, "home");
  const runtime = path.join(root, "runtime");
  const userData = path.join(home, ".config", packageJson.name);
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  for (const name of stateNames) fs.copyFileSync(path.join(fixtureDirectory, name), path.join(userData, name));
  const authPath = path.join(home, ".codex", "auth.json");
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(authPath, authFixture, { mode: 0o600 });
  return { root, home, runtime, userData, authPath };
}

function launch(executable, environment, label, { appImage = false } = {}) {
  const reportPath = path.join(environment.root, `${label}.json`);
  return new Promise((resolve, reject) => {
    const output = [];
    const applicationArguments = [
      "--disable-gpu",
      "--no-sandbox",
      `--test-upgrade-recovery=${reportPath}`,
    ];
    const command = xvfbRun || executable;
    const args = xvfbRun
      ? ["-a", executable, ...applicationArguments]
      : ["--ozone-platform=x11", ...applicationArguments];
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: {
        ...(appImage ? { APPIMAGE_EXTRACT_AND_RUN: "1" } : {}),
        CI: "1",
        ...(xvfbRun ? {} : {
          DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS,
          DISPLAY: process.env.DISPLAY,
          ...(process.env.XAUTHORITY ? { XAUTHORITY: process.env.XAUTHORITY } : {}),
        }),
        HOME: environment.home,
        LANG: "C.UTF-8",
        PATH: "/usr/bin:/bin",
        XDG_CACHE_HOME: path.join(environment.home, ".cache"),
        XDG_CONFIG_HOME: path.join(environment.home, ".config"),
        XDG_RUNTIME_DIR: environment.runtime,
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
      reject(new Error(`${label} timed out\n${output.join("")}`));
    }, 30_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${label} failed (${signal || code || "unknown"})\n${output.join("")}`));
        return;
      }
      try {
        resolve({
          report: json(reportPath),
          output: output.join("").trim().slice(-2000),
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function assertPrivate(filePath) {
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600, `${path.basename(filePath)} should be private`);
}

function assertPreserved(report, environment, packageType) {
  assert.equal(report.packaged, true);
  assert.equal(report.version, packageJson.version);
  assert.equal(report.packageType, packageType);
  assert.equal(report.userData, environment.userData);
  assert.equal(report.settings.version, 2);
  assert.equal(report.settings.lastThreadId, "thread-v08-preserved");
  assert.equal(report.settings.codexCliPath, "/usr/bin/codex");
  assert.equal(report.settings.desktop.closeToTray, true);
  assert.equal(report.settings.updates.channel, "beta");
  assert.equal(report.settings.updates.autoCheck, false);
  assert.equal(report.settings.reportingEnabled, false);
  assert.deepEqual(report.tasks.ids, ["task-v08-preserved"]);
  assert.deepEqual(report.tasks.inboxIds, ["inbox-v08-preserved"]);
  assert.deepEqual(report.creation.templateIds, ["template-v08-preserved"]);
  assert.deepEqual(report.creation.artifactIds, ["artifact-v08-preserved"]);
  assert.equal(fs.readFileSync(environment.authPath, "utf8"), authFixture);
}

try {
  const upgrade = seedHome("upgrade");
  const appImageUpgrade = await launch(appImagePath, upgrade, "appimage-upgrade", { appImage: true });
  assertPreserved(appImageUpgrade.report, upgrade, "appimage");
  assert.deepEqual(appImageUpgrade.report.tasks.storage.status, "migrated");
  assert.deepEqual(appImageUpgrade.report.creation.storage.status, "migrated");
  for (const name of stateNames) {
    const filePath = path.join(upgrade.userData, name);
    assert.equal(json(filePath).version, 2);
    assertPrivate(filePath);
    assertPrivate(`${filePath}.backup`);
    assertPrivate(`${filePath}.migration-backup`);
  }
  assert.equal(json(path.join(upgrade.userData, "settings.json.backup")).version, 2);
  assert.equal(json(path.join(upgrade.userData, "tasks.json.backup")).version, 1);
  assert.equal(json(path.join(upgrade.userData, "creation.json.backup")).version, 1);
  assert.equal(json(path.join(upgrade.userData, "settings.json.migration-backup")).version, undefined);
  assert.equal(json(path.join(upgrade.userData, "tasks.json.migration-backup")).version, 1);
  assert.equal(json(path.join(upgrade.userData, "creation.json.migration-backup")).version, 1);

  const debReinstall = await launch(debExecutable, upgrade, "deb-reinstall");
  assertPreserved(debReinstall.report, upgrade, "deb");
  assert.equal(debReinstall.report.tasks.storage.status, "current");
  assert.equal(debReinstall.report.creation.storage.status, "current");

  const recovery = seedHome("recovery");
  const recoverySettings = path.join(recovery.userData, "settings.json");
  fs.copyFileSync(recoverySettings, `${recoverySettings}.backup`);
  fs.writeFileSync(recoverySettings, "{broken");
  const recovered = await launch(appImagePath, recovery, "appimage-recovery", { appImage: true });
  assertPreserved(recovered.report, recovery, "appimage");
  assert.equal(json(recoverySettings).version, 2);
  assert.equal(json(`${recoverySettings}.backup`).lastThreadId, "thread-v08-preserved");

  const future = seedHome("future");
  const futureContents = new Map();
  for (const name of stateNames) {
    const contents = `${JSON.stringify({ version: 999, marker: `${name}-future` }, null, 2)}\n`;
    futureContents.set(name, contents);
    fs.writeFileSync(path.join(future.userData, name), contents);
  }
  const protectedFuture = await launch(appImagePath, future, "appimage-future", { appImage: true });
  assert.equal(protectedFuture.report.settings.storage.status, "future");
  assert.equal(protectedFuture.report.tasks.storage.status, "future");
  assert.equal(protectedFuture.report.creation.storage.status, "future");
  for (const [name, contents] of futureContents) {
    const filePath = path.join(future.userData, name);
    assert.equal(fs.readFileSync(filePath, "utf8"), contents);
    assert.equal(fs.existsSync(`${filePath}.backup`), false);
    assert.equal(fs.existsSync(`${filePath}.migration-backup`), false);
  }
  assert.equal(fs.readFileSync(future.authPath, "utf8"), authFixture);

  console.log(JSON.stringify({
    version: packageJson.version,
    packages: ["appimage", "deb"],
    scenarios: {
      upgrade: "0.8 fixtures migrated and preserved",
      reinstall: "AppImage state reopened by Debian package",
      recovery: "corrupt primary recovered from 0.8 backup",
      future: "newer state remained read-only and byte-for-byte unchanged",
      authentication: "CLI-owned authentication remained untouched",
    },
    display: xvfbRun ? "xvfb" : "existing-x11",
    output: {
      appImage: appImageUpgrade.output,
      deb: debReinstall.output,
    },
  }, null, 2));
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
