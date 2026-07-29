import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { BUILTIN_TASK_TEMPLATES, CreationStore, searchWorkspace, validateRealtimeAudioChunk } from "../src/main/creation-service.mjs";

test("creation store persists bounded artifacts and reusable templates", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "creation-store-"));
  const filePath = path.join(root, "creation.json");
  let now = 100;
  const store = new CreationStore(filePath, { now: () => now++, idFactory: () => `id-${now}` });
  const template = store.saveTemplate({ name: "Ship it", prompt: "Run checks and prepare the change.", isolation: "local" });
  const artifact = store.saveArtifact({ title: "Plan", kind: "plan", body: "# Plan\n\nVerify it.", repository: root });
  const reloaded = new CreationStore(filePath);
  assert.ok(reloaded.snapshot().templates.length > BUILTIN_TASK_TEMPLATES.length);
  assert.equal(reloaded.snapshot().templates.find((entry) => entry.id === template.id).isolation, "local");
  assert.equal(reloaded.artifact(artifact.id).body, "# Plan\n\nVerify it.");
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  reloaded.deleteTemplate(template.id);
  reloaded.deleteArtifact(artifact.id);
  assert.throws(() => reloaded.deleteTemplate(BUILTIN_TASK_TEMPLATES[0].id), /Built-in/);
});

test("workspace search combines threads, task outcomes, artifacts, and safe repository files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "creation-search-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "feature.js"), "export const lighthouse = true;\n");
  fs.writeFileSync(path.join(root, ".env"), "LIGHTHOUSE_SECRET=hidden\n");
  const results = searchWorkspace({
    query: "lighthouse",
    repository: root,
    threads: [{ id: "thread-1", name: "Lighthouse thread", cwd: root, updatedAt: 4 }],
    tasks: [{ id: "task-1", title: "Task", summary: "Lighthouse completed", state: "completed", updatedAt: 3 }],
    artifacts: [{ id: "artifact-1", title: "Plan", kind: "plan", body: "Lighthouse rollout", updatedAt: 2 }],
  });
  assert.deepEqual(new Set(results.map((entry) => entry.kind)), new Set(["thread", "task", "artifact", "file"]));
  assert.ok(results.some((entry) => entry.relativePath === "src/feature.js"));
  assert.ok(!results.some((entry) => entry.title.includes(".env")));
});

test("workspace search validates queries and realtime audio chunks", () => {
  assert.throws(() => searchWorkspace({ query: "x" }), /two/);
  assert.deepEqual(validateRealtimeAudioChunk({ data: "AAE=", sampleRate: 48_000, numChannels: 1, samplesPerChannel: 1 }), {
    data: "AAE=", sampleRate: 48_000, numChannels: 1, samplesPerChannel: 1,
  });
  assert.throws(() => validateRealtimeAudioChunk({ data: "!", sampleRate: 48_000, numChannels: 1, samplesPerChannel: 1 }), /audio data/);
  assert.throws(() => validateRealtimeAudioChunk({ data: "AA==", sampleRate: 2, numChannels: 1, samplesPerChannel: 1 }), /sample rate/);
});
