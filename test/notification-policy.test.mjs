import assert from "node:assert/strict";
import test from "node:test";
import {
  notificationContent,
  notificationDedupeKey,
  shouldShowNotification,
} from "../src/main/notification-policy.mjs";

const preferences = { notifyTurnComplete: true, notifyApproval: true, notifyTerminal: true };

test("notification policy only shows enabled, supported, unfocused, unique events", () => {
  assert.deepEqual(shouldShowNotification({ kind: "turn", preferences, supported: true, focused: false, duplicate: false }), { show: true, reason: null });
  assert.equal(shouldShowNotification({ kind: "turn", preferences, supported: true, focused: true, duplicate: false }).reason, "focused");
  assert.equal(shouldShowNotification({ kind: "request", preferences: { ...preferences, notifyApproval: false }, supported: true, focused: false, duplicate: false }).reason, "disabled");
  assert.equal(shouldShowNotification({ kind: "terminal", preferences, supported: false, focused: false, duplicate: false }).reason, "unsupported");
  assert.equal(shouldShowNotification({ kind: "terminal", preferences, supported: true, focused: false, duplicate: true }).reason, "duplicate");
});

test("notification content is fixed and excludes untrusted event details", () => {
  const secret = "SECRET_COMMAND_OUTPUT";
  const content = notificationContent("request", { requestType: "approval", command: secret, output: secret, path: secret });
  assert.equal(content.title, "Codex needs your approval");
  assert.equal(JSON.stringify(content).includes(secret), false);
});

test("terminal notification content reports only a bounded exit code", () => {
  assert.deepEqual(notificationContent("terminal", { exitCode: 0 }), {
    title: "Background terminal finished",
    body: "A project terminal exited successfully.",
    urgency: "low",
  });
  assert.match(notificationContent("terminal", { exitCode: 127 }).body, /127/);
  assert.doesNotMatch(notificationContent("terminal", { exitCode: 10_000_000 }).body, /10000000/);
  assert.match(notificationContent("terminal", { failedToStart: true }).body, /could not be started/);
});

test("notification dedupe keys accept bounded ids only", () => {
  assert.equal(notificationDedupeKey("turn", "turn-1"), "turn:turn-1");
  assert.throws(() => notificationDedupeKey("unknown", "id"), /Unsupported/);
  assert.throws(() => notificationDedupeKey("turn", ""), /invalid/);
});
