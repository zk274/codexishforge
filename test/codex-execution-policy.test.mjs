import assert from "node:assert/strict";
import test from "node:test";
import {
  secureThreadExecutionParams,
  secureTurnExecutionParams,
} from "../src/main/codex-execution-policy.mjs";

test("new and resumed threads always use bounded user-reviewed execution", () => {
  assert.deepEqual(secureThreadExecutionParams({
    threadId: "thread-1",
    model: "model-1",
    approvalPolicy: "never",
    approvalsReviewer: "auto_review",
    permissions: "full-access",
    sandbox: "danger-full-access",
  }), {
    threadId: "thread-1",
    model: "model-1",
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandbox: "workspace-write",
  });
});

test("every turn reapplies workspace-write even when a resumed thread was less restrictive", () => {
  assert.deepEqual(secureTurnExecutionParams({
    threadId: "thread-1",
    input: [{ type: "text", text: "test", text_elements: [] }],
    approvalPolicy: "never",
    approvalsReviewer: "auto_review",
    permissions: "full-access",
    sandboxPolicy: { type: "dangerFullAccess" },
  }), {
    threadId: "thread-1",
    input: [{ type: "text", text: "test", text_elements: [] }],
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandboxPolicy: { type: "workspaceWrite" },
  });
});
