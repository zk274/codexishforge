import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  LINUX_DESKTOP_NAME,
  resolveLinuxDesktopName,
} from "../src/main/desktop-identity.mjs";

test("uses the installed freedesktop identity on ordinary Linux packages", () => {
  assert.equal(resolveLinuxDesktopName({
    platform: "linux",
    snapInstanceName: null,
  }), LINUX_DESKTOP_NAME);
});

test("uses snapd's prefixed desktop filename for Snap instances", () => {
  assert.equal(resolveLinuxDesktopName({
    platform: "linux",
    snapInstanceName: "codexishforge",
  }), "codexishforge_io.github.zk274.codexishforge.desktop");
});

test("does not accept an unbounded Snap instance identity", () => {
  assert.equal(resolveLinuxDesktopName({
    platform: "linux",
    snapInstanceName: "../unsafe",
  }), LINUX_DESKTOP_NAME);
});

test("does not configure a freedesktop identity on other platforms", () => {
  assert.equal(resolveLinuxDesktopName({
    platform: "darwin",
    snapInstanceName: "codex-linux-community",
  }), null);
});

test("sets the desktop and migrated user-data identities before acquiring the instance lock", () => {
  const main = fs.readFileSync(new URL("../src/main/main.mjs", import.meta.url), "utf8");
  const setIdentity = main.indexOf("app.setDesktopName(linuxDesktopName)");
  const migrateUserData = main.indexOf("migrateLegacyUserData({");
  const setUserData = main.indexOf('app.setPath("userData"');
  const acquireLock = main.indexOf("app.requestSingleInstanceLock");
  assert.ok(setIdentity >= 0);
  assert.ok(migrateUserData > setIdentity);
  assert.ok(setUserData > migrateUserData);
  assert.ok(acquireLock > setIdentity);
  assert.ok(acquireLock > setUserData);
});
