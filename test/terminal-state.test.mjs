import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TERMINAL_OUTPUT,
  activateTerminal,
  activeTerminal,
  appendTerminalOutput,
  createTerminalCollection,
  createTerminalTab,
  removeTerminal,
  runningTerminalCount,
  terminalForHandle,
  unreadTerminalCount,
} from "../src/renderer/terminal-state.mjs";

test("terminal collection creates, activates, and removes tabs", () => {
  const collection = createTerminalCollection();
  const first = createTerminalTab(collection, { cwd: "/project/one" });
  const second = createTerminalTab(collection, { cwd: "/project/two" });
  first.handle = "process-1";
  first.status = "running";
  second.status = "exited";

  assert.equal(activeTerminal(collection), second);
  assert.equal(terminalForHandle(collection, "process-1"), first);
  assert.equal(runningTerminalCount(collection), 1);

  activateTerminal(collection, first.id);
  assert.equal(first.unread, false);
  removeTerminal(collection, first.id);
  assert.equal(activeTerminal(collection), second);
});

test("background terminal output is marked unread until its tab is activated", () => {
  const collection = createTerminalCollection();
  const first = createTerminalTab(collection, { cwd: "/project" });
  first.output = "";
  appendTerminalOutput(first, "visible\n", { visible: true });
  assert.equal(first.unread, false);

  appendTerminalOutput(first, "background\n");
  assert.equal(first.unread, true);
  assert.equal(unreadTerminalCount(collection), 1);

  activateTerminal(collection, first.id);
  assert.equal(unreadTerminalCount(collection), 0);
  assert.equal(first.output, "visible\nbackground\n");
});

test("terminal output is capped without losing the newest process output", () => {
  const collection = createTerminalCollection();
  const terminal = createTerminalTab(collection, { cwd: "/project" });
  terminal.output = "";
  appendTerminalOutput(terminal, "old".repeat(MAX_TERMINAL_OUTPUT));
  appendTerminalOutput(terminal, "latest output");

  assert.ok(terminal.output.length <= MAX_TERMINAL_OUTPUT);
  assert.match(terminal.output, /^\[Earlier output trimmed\]/);
  assert.match(terminal.output, /latest output$/);
});
