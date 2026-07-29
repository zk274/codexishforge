import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadVersionedState, saveVersionedState } from "../src/main/state-storage.mjs";

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-linux-state-"));
  return { directory, filePath: path.join(directory, "state.json") };
}

const options = {
  currentVersion: 2,
  defaults: { items: [] },
  migrations: {
    0: (value) => ({ version: 1, items: value.items || [] }),
    1: (value) => ({ ...value, version: 2 }),
  },
};

test("state storage migrates legacy data and preserves a private backup", (t) => {
  const { directory, filePath } = fixture();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(filePath, JSON.stringify({ items: ["legacy"] }));
  const loaded = loadVersionedState(filePath, options);
  assert.equal(loaded.meta.status, "migrated");
  assert.deepEqual(loaded.value, { version: 2, items: ["legacy"] });
  assert.equal(JSON.parse(fs.readFileSync(`${filePath}.backup`, "utf8")).items[0], "legacy");
  assert.equal(JSON.parse(fs.readFileSync(`${filePath}.migration-backup`, "utf8")).items[0], "legacy");
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(`${filePath}.migration-backup`).mode & 0o777, 0o600);
});

test("state storage recovers corrupt primary data from its last valid backup", (t) => {
  const { directory, filePath } = fixture();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  saveVersionedState(filePath, { items: ["one"] }, { currentVersion: 2 });
  saveVersionedState(filePath, { items: ["two"] }, { currentVersion: 2 });
  fs.writeFileSync(filePath, "{broken");
  const loaded = loadVersionedState(filePath, options);
  assert.equal(loaded.meta.status, "recovered");
  assert.deepEqual(loaded.value.items, ["one"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, "utf8")).items, ["one"]);
});

test("future state is never overwritten and becomes read-only", (t) => {
  const { directory, filePath } = fixture();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(filePath, JSON.stringify({ version: 9, items: ["future"] }));
  const loaded = loadVersionedState(filePath, options);
  assert.equal(loaded.meta.status, "future");
  assert.equal(loaded.meta.writable, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, "utf8")).items, ["future"]);
  assert.throws(() => saveVersionedState(filePath, loaded.value, { currentVersion: 2, writable: false }), /read-only/);
});
