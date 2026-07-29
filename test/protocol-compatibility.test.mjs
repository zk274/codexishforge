import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  evaluateProtocolCompatibility,
  inspectCodexProtocol,
  methodsFromSchema,
} from "../src/main/protocol-compatibility.mjs";

const completeMethods = {
  clientRequests: new Set([
    "initialize", "thread/list", "thread/start", "thread/resume", "turn/start", "turn/interrupt", "model/list", "account/read",
    "account/login/start", "account/logout", "process/spawn", "process/writeStdin", "process/kill", "process/resizePty",
    "skills/list", "skills/config/write", "plugin/installed", "mcpServerStatus/list", "config/mcpServer/reload", "config/read", "config/batchWrite",
    "thread/search", "thread/realtime/start", "thread/realtime/appendAudio", "thread/realtime/stop", "thread/realtime/listVoices",
  ]),
  clientNotifications: new Set(["initialized"]),
  serverNotifications: new Set([
    "turn/started", "turn/completed", "turn/diff/updated", "item/started", "item/completed", "item/agentMessage/delta",
    "item/fileChange/patchUpdated", "process/outputDelta", "process/exited", "account/login/completed", "account/updated",
    "thread/realtime/transcript/delta", "thread/realtime/transcript/done", "thread/realtime/outputAudio/delta",
  ]),
  serverRequests: new Set([
    "item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/tool/requestUserInput", "mcpServer/elicitation/request",
  ]),
};

function schema(methods) {
  return {
    oneOf: methods.map((method) => ({ properties: { method: { enum: [method] } } })),
  };
}

test("extracts app-server method names from generated union schemas", () => {
  assert.deepEqual([...methodsFromSchema(schema(["thread/list", "turn/start"]))], ["thread/list", "turn/start"]);
});

test("reports compatible, partial, and incompatible protocol surfaces", () => {
  const compatible = evaluateProtocolCompatibility(completeMethods, { checkedAt: "now" });
  assert.equal(compatible.status, "compatible");
  assert.equal(compatible.features.terminal.available, true);
  assert.equal(compatible.features.realtimeVoice.available, true);

  const withoutTerminal = { ...completeMethods, clientRequests: new Set([...completeMethods.clientRequests].filter((method) => !method.startsWith("process/"))) };
  const partial = evaluateProtocolCompatibility(withoutTerminal, { checkedAt: "now" });
  assert.equal(partial.status, "partial");
  assert.deepEqual(partial.unavailableFeatures, ["terminal"]);
  assert.equal(partial.features.core.available, true);

  const withoutThreads = { ...completeMethods, clientRequests: new Set([...completeMethods.clientRequests].filter((method) => method !== "thread/start")) };
  const incompatible = evaluateProtocolCompatibility(withoutThreads, { checkedAt: "now" });
  assert.equal(incompatible.status, "incompatible");
  assert.equal(incompatible.features.core.available, false);
  assert.ok(incompatible.missingMethods.includes("thread/start"));
});

test("accepts legacy approval methods as compatible alternatives", () => {
  const methods = {
    ...completeMethods,
    serverRequests: new Set(["execCommandApproval", "applyPatchApproval", "item/tool/requestUserInput", "mcpServer/elicitation/request"]),
  };
  assert.equal(evaluateProtocolCompatibility(methods).features.interactiveApprovals.available, true);
});

test("schema inspection falls back to stable generation and cleans its temporary directory", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-protocol-test-"));
  const run = async (_command, args) => {
    if (args.includes("--experimental")) throw new Error("unknown option");
    const out = args.at(-1);
    fs.mkdirSync(out, { recursive: true });
    for (const [channel, filename] of Object.entries({
      clientRequests: "ClientRequest.json",
      clientNotifications: "ClientNotification.json",
      serverNotifications: "ServerNotification.json",
      serverRequests: "ServerRequest.json",
    })) fs.writeFileSync(path.join(out, filename), JSON.stringify(schema([...completeMethods[channel]])));
  };
  try {
    const result = await inspectCodexProtocol("/usr/bin/codex", { run, tempRoot });
    assert.equal(result.status, "compatible");
    assert.equal(result.experimentalSchema, false);
    assert.deepEqual(fs.readdirSync(tempRoot), []);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
