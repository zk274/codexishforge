import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  UpdateService,
  detectLinuxPackageType,
  normalizeUpdatePreferences,
  updaterChannel,
  validateUpdateMetadata,
} from "../src/main/update-service.mjs";

class FakeUpdater extends EventEmitter {
  async checkForUpdates() { this.emit("checking-for-update"); }
  async downloadUpdate() {}
  quitAndInstall(silent, runAfter) { this.installArgs = [silent, runAfter]; }
}

const updateHash = Buffer.alloc(64).toString("base64");
const updateFiles = [{ url: "Codex-Linux-0.9.0.AppImage", sha512: updateHash, size: 1234 }];

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
  assert.deepEqual(service.snapshot().security, {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowDowngrade: false,
    metadataIntegrity: "sha512",
  });

  await service.check();
  assert.equal(service.snapshot().phase, "checking");
  updater.emit("update-available", { version: "0.4.0-beta.1", files: updateFiles });
  assert.equal(service.snapshot().canDownload, true);
  await service.download();
  updater.emit("download-progress", { percent: 42, transferred: 420, total: 1000 });
  assert.equal(service.snapshot().percent, 42);
  updater.emit("update-downloaded", { version: "0.4.0-beta.1" });
  assert.equal(service.snapshot().canInstall, true);
  service.install();
  assert.deepEqual(updater.installArgs, [false, true]);
});

test("validates bounded update versions, URLs, sizes, and hashes", () => {
  assert.deepEqual(validateUpdateMetadata({
    version: "0.9.0",
    files: [{ url: "Codex-Linux-0.9.0.AppImage", sha512: updateHash, size: 1234 }],
  }), { version: "0.9.0", files: 1 });
  assert.deepEqual(validateUpdateMetadata({
    version: "0.10.0-beta.1",
    files: [{ url: "https://github.com/zk274/codexishforge/releases/download/v0.10.0-beta.1/app.AppImage", sha512: updateHash, size: 1234 }],
  }, { channel: "beta" }), { version: "0.10.0-beta.1", files: 1 });

  assert.throws(() => validateUpdateMetadata({ version: "0.9" }), /invalid version/);
  assert.throws(() => validateUpdateMetadata({ version: "0.9.0-beta.1", files: updateFiles }), /stable channel/);
  assert.throws(() => validateUpdateMetadata({
    version: "0.9.0",
    files: [{ url: "../app.AppImage", sha512: updateHash, size: 1234 }],
  }), /plain filenames/);
  assert.throws(() => validateUpdateMetadata({
    version: "0.9.0",
    files: [{ url: "https://user:token@example.com/app.AppImage", sha512: updateHash, size: 1234 }],
  }), /credential/);
  assert.throws(() => validateUpdateMetadata({
    version: "0.9.0",
    files: [{ url: "app.AppImage", sha512: "not-a-hash", size: 1234 }],
  }), /SHA-512/);
  assert.throws(() => validateUpdateMetadata({
    version: "0.9.0",
    files: [{ url: "data:application/octet-stream", sha512: updateHash, size: 1234 }],
  }), /plain filenames/);
});

test("rejects unsafe metadata before an update can download", () => {
  const updater = new FakeUpdater();
  const service = new UpdateService({
    updater,
    currentVersion: "0.8.0",
    packageType: "appimage",
    preferences: {},
  });
  updater.emit("update-available", { version: "0.9.0-beta.1", files: updateFiles });
  assert.equal(service.snapshot().phase, "error");
  assert.equal(service.snapshot().canDownload, false);
  assert.equal(service.snapshot().metadataValidated, false);
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
