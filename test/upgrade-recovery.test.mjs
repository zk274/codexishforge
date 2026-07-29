import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CreationStore } from "../src/main/creation-service.mjs";
import { loadSettingsState, saveSettingsState, SETTINGS_STATE_VERSION } from "../src/main/settings-state.mjs";
import { TaskStore } from "../src/main/task-service.mjs";

const fixtureDirectory = path.join(import.meta.dirname, "fixtures", "state-v0.8");
const stateFiles = ["settings.json", "tasks.json", "creation.json"];

function copyFixtures(destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const name of stateFiles) fs.copyFileSync(path.join(fixtureDirectory, name), path.join(destination, name));
}

function json(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function privateFile(filePath) {
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600, `${path.basename(filePath)} should be private`);
}

function temporaryState(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-linux-upgrade-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  copyFixtures(directory);
  return directory;
}

test("real 0.8 state migrates without losing settings, tasks, inbox, templates, or artifacts", (t) => {
  const directory = temporaryState(t);
  const settingsPath = path.join(directory, "settings.json");
  const tasksPath = path.join(directory, "tasks.json");
  const creationPath = path.join(directory, "creation.json");

  const settings = loadSettingsState(settingsPath);
  const tasks = new TaskStore(tasksPath, { now: () => 1750000030000 });
  const creation = new CreationStore(creationPath, { now: () => 1750000030000 });

  assert.deepEqual(
    [settings.meta.status, tasks.storage.status, creation.storage.status],
    ["migrated", "migrated", "migrated"],
  );
  assert.deepEqual(
    [settings.meta.fromVersion, tasks.storage.fromVersion, creation.storage.fromVersion],
    [0, 1, 1],
  );
  assert.equal(settings.value.lastThreadId, "thread-v08-preserved");
  assert.equal(settings.value.desktop.closeToTray, true);
  assert.equal(settings.value.updates.channel, "beta");
  assert.equal(settings.value.reporting.enabled, false);
  assert.equal(tasks.snapshot().tasks[0].id, "task-v08-preserved");
  assert.equal(tasks.snapshot().inbox[0].id, "inbox-v08-preserved");
  assert.equal(creation.snapshot().templates.find((entry) => !entry.builtin).id, "template-v08-preserved");
  assert.equal(creation.snapshot().artifacts[0].id, "artifact-v08-preserved");

  for (const name of stateFiles) {
    const filePath = path.join(directory, name);
    assert.equal(json(filePath).version, 2);
    privateFile(filePath);
    privateFile(`${filePath}.backup`);
    privateFile(`${filePath}.migration-backup`);
  }
  assert.equal(json(`${settingsPath}.backup`).version, undefined);
  assert.equal(json(`${tasksPath}.backup`).version, 1);
  assert.equal(json(`${creationPath}.backup`).version, 1);
  assert.equal(json(`${settingsPath}.migration-backup`).version, undefined);
  assert.equal(json(`${tasksPath}.migration-backup`).version, 1);
  assert.equal(json(`${creationPath}.migration-backup`).version, 1);

  saveSettingsState(settingsPath, settings.value, { writable: settings.meta.writable });
  tasks.save();
  creation.save();
  assert.equal(loadSettingsState(settingsPath).meta.status, "current");
  assert.equal(new TaskStore(tasksPath).snapshot().tasks[0].id, "task-v08-preserved");
  assert.equal(new CreationStore(creationPath).snapshot().artifacts[0].id, "artifact-v08-preserved");
});

test("corrupt current settings recover from and migrate an intact 0.8 backup", (t) => {
  const directory = temporaryState(t);
  const settingsPath = path.join(directory, "settings.json");
  fs.copyFileSync(settingsPath, `${settingsPath}.backup`);
  fs.writeFileSync(settingsPath, "{broken");

  const loaded = loadSettingsState(settingsPath);
  assert.equal(loaded.meta.status, "recovered");
  assert.equal(loaded.meta.source, "backup");
  assert.equal(loaded.meta.fromVersion, 0);
  assert.equal(loaded.value.version, SETTINGS_STATE_VERSION);
  assert.equal(loaded.value.lastThreadId, "thread-v08-preserved");
  assert.equal(json(settingsPath).version, SETTINGS_STATE_VERSION);
  assert.equal(json(`${settingsPath}.backup`).lastThreadId, "thread-v08-preserved");
});

test("future settings, task, and creation state remain byte-for-byte untouched and read-only", (t) => {
  const directory = temporaryState(t);
  for (const name of stateFiles) {
    const filePath = path.join(directory, name);
    const future = `${JSON.stringify({ version: 999, marker: `${name}-future` }, null, 2)}\n`;
    fs.writeFileSync(filePath, future);
    let meta;
    let save;
    if (name === "settings.json") {
      const loaded = loadSettingsState(filePath);
      meta = loaded.meta;
      save = () => saveSettingsState(filePath, loaded.value, { writable: meta.writable });
    } else if (name === "tasks.json") {
      const store = new TaskStore(filePath);
      meta = store.storage;
      save = () => store.save();
    } else {
      const store = new CreationStore(filePath);
      meta = store.storage;
      save = () => store.save();
    }
    assert.equal(meta.status, "future");
    assert.equal(meta.writable, false);
    assert.throws(save, /read-only/);
    assert.equal(fs.readFileSync(filePath, "utf8"), future);
    assert.equal(fs.existsSync(`${filePath}.backup`), false);
    assert.equal(fs.existsSync(`${filePath}.migration-backup`), false);
  }
});
