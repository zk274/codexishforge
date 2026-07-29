import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const coreRequirements = [
  ["clientRequests", "initialize"],
  ["clientNotifications", "initialized"],
  ...["thread/list", "thread/start", "thread/resume", "turn/start", "turn/interrupt", "model/list", "account/read"].map((method) => ["clientRequests", method]),
  ...["turn/started", "turn/completed", "item/started", "item/completed", "item/agentMessage/delta"].map((method) => ["serverNotifications", method]),
];

const featureRequirements = {
  authentication: [
    ["clientRequests", "account/login/start"],
    ["clientRequests", "account/logout"],
    ["serverNotifications", "account/login/completed"],
    ["serverNotifications", "account/updated"],
  ],
  terminal: [
    ...["process/spawn", "process/writeStdin", "process/kill", "process/resizePty"].map((method) => ["clientRequests", method]),
    ["serverNotifications", "process/outputDelta"],
    ["serverNotifications", "process/exited"],
  ],
  changeStreaming: [
    ["serverNotifications", "turn/diff/updated"],
    ["serverNotifications", "item/fileChange/patchUpdated"],
  ],
  interactiveApprovals: [
    ["serverRequests", ["item/commandExecution/requestApproval", "execCommandApproval"]],
    ["serverRequests", ["item/fileChange/requestApproval", "applyPatchApproval"]],
    ["serverRequests", "item/tool/requestUserInput"],
    ["serverRequests", "mcpServer/elicitation/request"],
  ],
  skillInventory: [["clientRequests", "skills/list"]],
  skillManagement: [["clientRequests", "skills/config/write"]],
  pluginInventory: [["clientRequests", "plugin/installed"]],
  mcpInventory: [["clientRequests", "mcpServerStatus/list"]],
  mcpManagement: [["clientRequests", "config/mcpServer/reload"]],
  configInventory: [["clientRequests", "config/read"]],
  configManagement: [["clientRequests", "config/batchWrite"]],
  threadSearch: [["clientRequests", "thread/search"]],
  realtimeVoice: [
    ...["thread/realtime/start", "thread/realtime/appendAudio", "thread/realtime/stop", "thread/realtime/listVoices"].map((method) => ["clientRequests", method]),
    ...["thread/realtime/transcript/delta", "thread/realtime/transcript/done", "thread/realtime/outputAudio/delta"].map((method) => ["serverNotifications", method]),
  ],
};

const schemaFiles = {
  clientRequests: "ClientRequest.json",
  clientNotifications: "ClientNotification.json",
  serverNotifications: "ServerNotification.json",
  serverRequests: "ServerRequest.json",
};

export const PROTOCOL_COMPATIBILITY_MATRIX = Object.freeze([
  { id: "core-v1", label: "Core threads", features: [] },
  { id: "desktop-v1", label: "Desktop workflow", features: ["authentication", "terminal", "changeStreaming", "interactiveApprovals"] },
  { id: "extensions-v1", label: "Extension management", features: ["skillInventory", "skillManagement", "pluginInventory", "mcpInventory", "mcpManagement", "configInventory", "configManagement"] },
  { id: "creation-v2", label: "Richer creation", features: ["threadSearch", "realtimeVoice"] },
]);

function schemaFingerprint(methods) {
  const lines = Object.entries(methods)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([channel, values]) => [...(values || [])].sort().map((method) => `${channel}:${method}`));
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 24);
}

function protocolProfile(features) {
  let profile = PROTOCOL_COMPATIBILITY_MATRIX[0];
  const cumulativeFeatures = [];
  for (const candidate of PROTOCOL_COMPATIBILITY_MATRIX.slice(1)) {
    cumulativeFeatures.push(...candidate.features);
    if (cumulativeFeatures.every((name) => features[name]?.available)) profile = candidate;
    else break;
  }
  return { id: profile.id, label: profile.label };
}

export function unknownProtocolCompatibility(message = "Protocol compatibility has not been checked.") {
  return {
    revision: 2,
    status: "unknown",
    source: null,
    experimentalSchema: null,
    checkedAt: null,
    schemaFingerprint: null,
    profile: null,
    missingMethod: null,
    missingMethods: [],
    unavailableFeatures: [],
    features: {},
    message,
  };
}

export function methodsFromSchema(schema) {
  const methods = new Set();
  function visit(node) {
    if (!node || typeof node !== "object") return;
    for (const method of node.properties?.method?.enum || []) {
      if (typeof method === "string") methods.add(method);
    }
    for (const keyword of ["oneOf", "anyOf", "allOf"]) {
      for (const child of node[keyword] || []) visit(child);
    }
  }
  visit(schema);
  return methods;
}

function missingRequirements(methods, requirements) {
  const missing = [];
  for (const [channel, expected] of requirements) {
    const alternatives = Array.isArray(expected) ? expected : [expected];
    if (!alternatives.some((method) => methods[channel]?.has(method))) missing.push(alternatives.join(" or "));
  }
  return missing;
}

export function evaluateProtocolCompatibility(methods, { experimentalSchema = true, checkedAt = new Date().toISOString() } = {}) {
  const missingCore = missingRequirements(methods, coreRequirements);
  const features = {};
  for (const [name, requirements] of Object.entries(featureRequirements)) {
    const missingMethods = missingRequirements(methods, requirements);
    features[name] = { available: missingMethods.length === 0, missingMethods };
  }
  const unavailableFeatures = Object.entries(features).filter(([, result]) => !result.available).map(([name]) => name);
  const missingMethods = [...new Set([...missingCore, ...unavailableFeatures.flatMap((name) => features[name].missingMethods)])];
  let status = "compatible", message = "All required app-server capabilities are available.";
  if (missingCore.length) {
    status = "incompatible";
    message = `This Codex CLI is missing ${missingCore.length} core app-server method${missingCore.length === 1 ? "" : "s"}.`;
  } else if (unavailableFeatures.length) {
    status = "partial";
    message = `Core app-server support is available, but ${unavailableFeatures.join(", ")} ${unavailableFeatures.length === 1 ? "is" : "are"} unavailable.`;
  }
  return {
    revision: 2,
    status,
    source: "generated-schema",
    experimentalSchema,
    checkedAt,
    schemaFingerprint: schemaFingerprint(methods),
    profile: protocolProfile(features),
    missingMethod: missingMethods[0] || null,
    missingMethods,
    unavailableFeatures,
    features: { core: { available: missingCore.length === 0, missingMethods: missingCore }, ...features },
    message,
  };
}

export function compareProtocolCompatibility(previous, current) {
  const oldFingerprint = typeof previous?.schemaFingerprint === "string" ? previous.schemaFingerprint : null;
  const newFingerprint = typeof current?.schemaFingerprint === "string" ? current.schemaFingerprint : null;
  const changed = Boolean(oldFingerprint && newFingerprint && oldFingerprint !== newFingerprint);
  const newlyUnavailable = Object.entries(current?.features || {})
    .filter(([name, value]) => name !== "core" && value?.available === false && previous?.features?.[name]?.available === true)
    .map(([name]) => name);
  return {
    changed,
    previousFingerprint: oldFingerprint,
    currentFingerprint: newFingerprint,
    previousProfile: previous?.profile?.id || null,
    currentProfile: current?.profile?.id || null,
    newlyUnavailable,
    requiresAttention: current?.status === "incompatible" || newlyUnavailable.length > 0,
  };
}

export async function inspectCodexProtocol(command, {
  run = execFileAsync,
  fsApi = fs,
  tempRoot = os.tmpdir(),
  timeoutMs = 15_000,
} = {}) {
  if (!command) return unknownProtocolCompatibility("The Codex CLI executable was not found.");
  const directory = fsApi.mkdtempSync(path.join(tempRoot, "codex-linux-protocol-"));
  let experimentalSchema = true;
  let outputDirectory = path.join(directory, "experimental");
  try {
    try {
      await run(command, ["app-server", "generate-json-schema", "--experimental", "--out", outputDirectory], {
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
      });
    } catch (experimentalError) {
      experimentalSchema = false;
      outputDirectory = path.join(directory, "stable");
      try {
        await run(command, ["app-server", "generate-json-schema", "--out", outputDirectory], {
          encoding: "utf8",
          timeout: timeoutMs,
          maxBuffer: 4 * 1024 * 1024,
        });
      } catch (stableError) {
        return unknownProtocolCompatibility(`Unable to generate the app-server schema: ${stableError.message || experimentalError.message}`);
      }
    }

    const methods = {};
    for (const [channel, filename] of Object.entries(schemaFiles)) {
      methods[channel] = methodsFromSchema(JSON.parse(fsApi.readFileSync(path.join(outputDirectory, filename), "utf8")));
    }
    return evaluateProtocolCompatibility(methods, { experimentalSchema });
  } catch (error) {
    return unknownProtocolCompatibility(`Unable to inspect the app-server schema: ${error.message}`);
  } finally {
    fsApi.rmSync(directory, { recursive: true, force: true });
  }
}
