import test from "node:test";
import assert from "node:assert/strict";
import { mergeTurnSnapshot } from "../src/renderer/conversation-state.mjs";

const localUser = {
  type: "userMessage",
  id: "local-1",
  content: [{ type: "text", text: "Run the approval test" }],
};

test("completed turn snapshots preserve the locally submitted user message", () => {
  const merged = mergeTurnSnapshot(
    { id: "turn-1", status: "inProgress", items: [localUser] },
    { id: "turn-1", status: "completed", items: [{ type: "agentMessage", id: "agent-1", text: "Done" }] },
  );

  assert.equal(merged.status, "completed");
  assert.deepEqual(merged.items, [
    localUser,
    { type: "agentMessage", id: "agent-1", text: "Done" },
  ]);
});

test("server-provided user messages replace their local placeholder without duplication", () => {
  const serverUser = {
    type: "userMessage",
    id: "server-user-1",
    content: [{ type: "text", text: "Run the approval test" }],
  };
  const merged = mergeTurnSnapshot(
    { id: "turn-1", items: [localUser] },
    { id: "turn-1", items: [serverUser] },
  );

  assert.deepEqual(merged.items, [serverUser]);
});

test("late empty lifecycle snapshots do not erase streamed items", () => {
  const streamed = { type: "agentMessage", id: "agent-1", text: "Still working" };
  const merged = mergeTurnSnapshot(
    { id: "turn-1", status: "inProgress", items: [localUser, streamed] },
    { id: "turn-1", status: "inProgress", items: [] },
  );

  assert.deepEqual(merged.items, [localUser, streamed]);
});

test("resumed turns use server history when no local turn exists", () => {
  const incoming = { id: "turn-1", status: "completed", items: [localUser] };
  assert.deepEqual(mergeTurnSnapshot(undefined, incoming), incoming);
  assert.notEqual(mergeTurnSnapshot(undefined, incoming).items, incoming.items);
});

test("matching item ids merge updates instead of producing duplicates", () => {
  const merged = mergeTurnSnapshot(
    { id: "turn-1", items: [{ type: "commandExecution", id: "command-1", command: "pwd", aggregatedOutput: "/tmp" }] },
    { id: "turn-1", items: [{ type: "commandExecution", id: "command-1", status: "completed" }] },
  );

  assert.deepEqual(merged.items, [{
    type: "commandExecution",
    id: "command-1",
    command: "pwd",
    aggregatedOutput: "/tmp",
    status: "completed",
  }]);
});
