import assert from "node:assert/strict";
import test from "node:test";
import { responseForRequest } from "../src/renderer/approval-state.mjs";

test("modern and legacy approval fixtures use their protocol-specific decisions", () => {
  const modern = { method: "item/commandExecution/requestApproval" };
  assert.deepEqual(responseForRequest(modern, "allow"), {
    kind: "answer", result: { decision: "accept" }, openUrl: null,
  });
  assert.deepEqual(responseForRequest(modern, "session"), {
    kind: "answer", result: { decision: "acceptForSession" }, openUrl: null,
  });
  assert.deepEqual(responseForRequest(modern, "deny"), {
    kind: "answer", result: { decision: "decline" }, openUrl: null,
  });

  const legacy = { method: "applyPatchApproval" };
  assert.deepEqual(responseForRequest(legacy, "allow"), {
    kind: "answer", result: { decision: "approved" }, openUrl: null,
  });
  assert.deepEqual(responseForRequest(legacy, "session"), {
    kind: "answer", result: { decision: "approved_for_session" }, openUrl: null,
  });
  assert.deepEqual(responseForRequest(legacy, "deny"), {
    kind: "answer", result: { decision: "denied" }, openUrl: null,
  });
});

test("question and permission fixtures preserve bounded user choices", () => {
  assert.deepEqual(responseForRequest(
    { method: "item/tool/requestUserInput" },
    "allow",
    { answers: { environment: { answers: ["staging"] } } },
  ), {
    kind: "answer",
    result: { answers: { environment: { answers: ["staging"] } } },
    openUrl: null,
  });
  assert.deepEqual(responseForRequest(
    {
      method: "item/permissions/requestApproval",
      params: { permissions: { network: { enabled: true }, fileSystem: { read: ["/tmp"] }, ignored: true } },
    },
    "session",
  ), {
    kind: "answer",
    result: {
      permissions: { network: { enabled: true }, fileSystem: { read: ["/tmp"] } },
      scope: "session",
    },
    openUrl: null,
  });
});

test("MCP and unsupported request fixtures decline safely", () => {
  assert.deepEqual(responseForRequest(
    { method: "mcpServer/elicitation/request", params: { mode: "form" } },
    "deny",
  ), {
    kind: "answer",
    result: { action: "decline", content: null, _meta: null },
    openUrl: null,
  });
  assert.deepEqual(responseForRequest({ method: "unknown/request" }, "allow"), {
    kind: "reject",
    message: "Unsupported request: unknown/request",
  });
});
