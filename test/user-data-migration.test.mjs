import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  USER_DATA_MIGRATION_MARKER,
  isEphemeralUserDataPath,
  migrateLegacyUserData,
} from "../src/main/user-data-migration.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codexishforge-user-data-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    current: path.join(root, "codexishforge"),
    legacy: path.join(root, "codex-linux-community"),
    codex: path.join(root, ".codex"),
  };
}

function migrate(paths, overrides = {}) {
  return migrateLegacyUserData({
    appDataDirectory: paths.root,
    processKill() {
      const error = new Error("not running");
      error.code = "ESRCH";
      throw error;
    },
    ...overrides,
  });
}

test("uses the stable CodeXishForge directory when neither identity exists", (t) => {
  const paths = fixture(t);
  const result = migrate(paths);
  assert.deepEqual(result, {
    userDataPath: paths.current,
    legacyPath: paths.legacy,
    migrated: false,
    existing: false,
    rollbackAvailable: false,
    reusedMigration: false,
  });
  assert.equal(fs.existsSync(paths.current), false);
});

test("copies all durable legacy data atomically and retains an untouched rollback directory", (t) => {
  const paths = fixture(t);
  fs.mkdirSync(path.join(paths.legacy, "worktrees"), { recursive: true });
  fs.mkdirSync(path.join(paths.legacy, "Local Storage", "leveldb"), { recursive: true });
  fs.writeFileSync(path.join(paths.legacy, "settings.json"), "settings");
  fs.writeFileSync(path.join(paths.legacy, "tasks.json"), "tasks");
  fs.writeFileSync(path.join(paths.legacy, "creation.json"), "creation");
  fs.writeFileSync(path.join(paths.legacy, "worktrees", "permission-state"), "preserved");
  fs.writeFileSync(path.join(paths.legacy, "running.lock"), "999999999");
  fs.writeFileSync(path.join(paths.legacy, "SingletonSocket"), "stale");
  fs.writeFileSync(path.join(paths.legacy, "Local Storage", "leveldb", "LOCK"), "stale");
  fs.mkdirSync(paths.codex);
  fs.writeFileSync(path.join(paths.codex, "auth.json"), "must-not-change");

  const result = migrate(paths);
  assert.equal(result.migrated, true);
  assert.equal(result.rollbackAvailable, true);
  assert.equal(fs.readFileSync(path.join(paths.legacy, "settings.json"), "utf8"), "settings");
  assert.equal(fs.readFileSync(path.join(paths.current, "settings.json"), "utf8"), "settings");
  assert.equal(fs.readFileSync(path.join(paths.current, "tasks.json"), "utf8"), "tasks");
  assert.equal(fs.readFileSync(path.join(paths.current, "creation.json"), "utf8"), "creation");
  assert.equal(fs.readFileSync(path.join(paths.current, "worktrees", "permission-state"), "utf8"), "preserved");
  assert.equal(fs.existsSync(path.join(paths.current, "running.lock")), false);
  assert.equal(fs.existsSync(path.join(paths.current, "SingletonSocket")), false);
  assert.equal(fs.readFileSync(path.join(paths.current, "Local Storage", "leveldb", "LOCK"), "utf8"), "stale");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(paths.current, USER_DATA_MIGRATION_MARKER), "utf8")), {
    schema: 1,
    source: "codex-linux-community",
  });
  assert.equal(fs.readFileSync(path.join(paths.codex, "auth.json"), "utf8"), "must-not-change");
});

test("accepts both directories only after a recognized completed migration", (t) => {
  const paths = fixture(t);
  fs.mkdirSync(paths.legacy);
  fs.writeFileSync(path.join(paths.legacy, "settings.json"), "legacy");
  migrate(paths);

  const secondStart = migrate(paths);
  assert.equal(secondStart.migrated, true);
  assert.equal(secondStart.reusedMigration, true);
  assert.equal(secondStart.rollbackAvailable, true);
  assert.equal(fs.readFileSync(path.join(paths.current, "settings.json"), "utf8"), "legacy");
});

test("refuses an unrecognized or malformed dual-directory state", (t) => {
  const paths = fixture(t);
  fs.mkdirSync(paths.current);
  fs.mkdirSync(paths.legacy);
  fs.writeFileSync(path.join(paths.current, "settings.json"), "current");
  fs.writeFileSync(path.join(paths.legacy, "settings.json"), "legacy");

  assert.throws(() => migrate(paths), { code: "USER_DATA_CONFLICT" });
  fs.writeFileSync(path.join(paths.current, USER_DATA_MIGRATION_MARKER), "not-json");
  assert.throws(() => migrate(paths), { code: "USER_DATA_CONFLICT" });
  assert.equal(fs.readFileSync(path.join(paths.current, "settings.json"), "utf8"), "current");
  assert.equal(fs.readFileSync(path.join(paths.legacy, "settings.json"), "utf8"), "legacy");
});

test("refuses migration while a live legacy process marker exists", (t) => {
  const paths = fixture(t);
  fs.mkdirSync(paths.legacy);
  fs.writeFileSync(path.join(paths.legacy, "running.lock"), "4242");
  assert.throws(
    () => migrate(paths, { processKill: (pid, signal) => { assert.equal(pid, 4242); assert.equal(signal, 0); } }),
    { code: "USER_DATA_IN_USE" },
  );
  assert.equal(fs.existsSync(paths.current), false);
  assert.equal(fs.existsSync(path.join(paths.legacy, "running.lock")), true);
});

test("discards the private copy if the legacy app starts during migration", (t) => {
  const paths = fixture(t);
  fs.mkdirSync(paths.legacy);
  fs.writeFileSync(path.join(paths.legacy, "settings.json"), "legacy");
  fs.writeFileSync(path.join(paths.legacy, "running.lock"), "4242");
  let checks = 0;
  assert.throws(
    () => migrate(paths, {
      processKill(pid, signal) {
        assert.equal(pid, 4242);
        assert.equal(signal, 0);
        checks += 1;
        if (checks === 1) {
          const error = new Error("not running yet");
          error.code = "ESRCH";
          throw error;
        }
      },
    }),
    { code: "USER_DATA_IN_USE" },
  );
  assert.equal(checks, 2);
  assert.equal(fs.existsSync(paths.current), false);
  assert.equal(fs.readFileSync(path.join(paths.legacy, "settings.json"), "utf8"), "legacy");
  assert.equal(fs.readdirSync(paths.root).some((entry) => entry.startsWith(".codexishforge.migration-")), false);
});

test("refuses symlinks and non-directory identity paths", (t) => {
  const paths = fixture(t);
  const target = path.join(paths.root, "elsewhere");
  fs.mkdirSync(target);
  fs.symlinkSync(target, paths.legacy);
  assert.throws(() => migrate(paths), { code: "USER_DATA_UNSAFE_PATH" });
  fs.unlinkSync(paths.legacy);
  fs.writeFileSync(paths.current, "not a directory");
  assert.throws(() => migrate(paths), { code: "USER_DATA_UNSAFE_PATH" });
});

test("partial copy failures clean only the private temporary target and never mutate the source", () => {
  const calls = [];
  const fakeFs = {
    lstatSync(candidate) {
      if (candidate === "/config/codexishforge" || candidate.endsWith("/running.lock") || candidate.endsWith("/SingletonLock")) {
        const error = new Error("missing");
        error.code = "ENOENT";
        throw error;
      }
      return { isSymbolicLink: () => false, isDirectory: () => true };
    },
    readFileSync(candidate) {
      const error = new Error(`missing ${candidate}`);
      error.code = "ENOENT";
      throw error;
    },
    mkdtempSync(prefix) {
      assert.equal(prefix, "/config/.codexishforge.migration-");
      return "/config/.codexishforge.migration-test-copy";
    },
    cpSync(from, to) {
      calls.push({ kind: "copy", from, to });
      throw new Error("copy failed");
    },
    rmSync(target, options) { calls.push({ kind: "remove", target, options }); },
  };
  assert.throws(
    () => migrateLegacyUserData({
      appDataDirectory: "/config",
      fsModule: fakeFs,
      processKill: () => {},
    }),
    { code: "USER_DATA_MIGRATION_FAILED" },
  );
  assert.deepEqual(calls, [
    { kind: "copy", from: "/config/codex-linux-community", to: "/config/.codexishforge.migration-test-copy/codexishforge" },
    { kind: "remove", target: "/config/.codexishforge.migration-test-copy", options: { recursive: true, force: true } },
  ]);
});

test("ephemeral lock filtering is narrowly scoped", () => {
  assert.equal(isEphemeralUserDataPath("running.lock"), true);
  assert.equal(isEphemeralUserDataPath("SingletonLock"), true);
  assert.equal(isEphemeralUserDataPath(path.join("Local Storage", "leveldb", "LOCK")), false);
  assert.equal(isEphemeralUserDataPath(path.join("archive", "running.lock")), false);
  assert.equal(isEphemeralUserDataPath("settings.json"), false);
});
