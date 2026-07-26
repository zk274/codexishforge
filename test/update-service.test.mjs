import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  UpdateService,
  detectLinuxPackageType,
  normalizeUpdatePreferences,
  updaterChannel,
} from "../src/main/update-service.mjs";

class FakeUpdater extends EventEmitter {
  async checkForUpdates() { this.emit("checking-for-update"); }
  async downloadUpdate() {}
  quitAndInstall(silent, runAfter) { this.installArgs = [silent, runAfter]; }
}

test("normalizes stable and beta update preferences", () => {
  assert.deepEqual(normalizeUpdatePreferences(), { channel: "stable", autoCheck: true });
  assert.deepEqual(normalizeUpdatePreferences({ channel: "beta", autoCheck: false }), { channel: "beta", autoCheck: false });
  assert.deepEqual(normalizeUpdatePreferences({ channel: "nightly" }), { channel: "stable", autoCheck: true });
  assert.equal(updaterChannel({ channel: "stable" }), "latest");
  assert.equal(updaterChannel({ channel: "beta" }), "beta");
});

test("detects development, AppImage, Snap, and Debian packages", () => {
  assert.equal(detectLinuxPackageType({ packaged: false }), "development");
  assert.equal(detectLinuxPackageType({
    packaged: true,
    env: { APPIMAGE: "/apps/Codex.AppImage" },
    execPath: "/tmp/.mount/codex",
    resourcesPath: "/resources",
  }), "appimage");
  assert.equal(detectLinuxPackageType({
    packaged: true,
    env: { SNAP: "/snap/codex/current" },
    execPath: "/snap/codex/current/codex",
    resourcesPath: "/resources",
  }), "snap");
  assert.equal(detectLinuxPackageType({
    packaged: true,
    env: {},
    execPath: "/opt/codex",
    resourcesPath: "/resources",
    readFile: () => "deb\n",
  }), "deb");
});

test("ignores Snap variables inherited from a parent app", () => {
  assert.equal(detectLinuxPackageType({
    packaged: true,
    env: { SNAP: "/snap/code/current" },
    execPath: "/opt/codex/codex",
    resourcesPath: "/resources",
    readFile: () => "deb",
  }), "deb");
});

test("configures explicit download policy and follows updater events", async () => {
  const updater = new FakeUpdater();
  const service = new UpdateService({
    updater,
    currentVersion: "0.3.0",
    packageType: "appimage",
    preferences: { channel: "beta", autoCheck: true },
  });
  assert.equal(updater.channel, "beta");
  assert.equal(updater.allowPrerelease, true);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);

  await service.check();
  assert.equal(service.snapshot().phase, "checking");
  updater.emit("update-available", { version: "0.4.0-beta.1" });
  assert.equal(service.snapshot().canDownload, true);
  await service.download();
  updater.emit("download-progress", { percent: 42, transferred: 420, total: 1000 });
  assert.equal(service.snapshot().percent, 42);
  updater.emit("update-downloaded", { version: "0.4.0-beta.1" });
  assert.equal(service.snapshot().canInstall, true);
  service.install();
  assert.deepEqual(updater.installArgs, [false, true]);
});

test("reports current versions and bounded updater errors", () => {
  const updater = new FakeUpdater();
  const service = new UpdateService({
    updater,
    currentVersion: "0.3.0",
    packageType: "deb",
    preferences: {},
  });
  updater.emit("update-not-available", { version: "0.3.0" });
  assert.equal(service.snapshot().phase, "current");
  updater.emit("error", new Error(`failed\n${"x".repeat(900)}`));
  assert.equal(service.snapshot().phase, "error");
  assert.ok(service.snapshot().error.length <= 500);
  assert.doesNotMatch(service.snapshot().error, /\n/);
});

test("keeps development and Snap builds store-managed or unavailable", () => {
  for (const packageType of ["development", "snap", "unknown"]) {
    const service = new UpdateService({
      updater: new FakeUpdater(),
      currentVersion: "0.3.0",
      packageType,
      preferences: {},
    });
    assert.equal(service.snapshot().supported, false);
    assert.equal(service.snapshot().canCheck, false);
  }
});
