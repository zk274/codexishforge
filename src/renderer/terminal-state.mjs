export const MAX_TERMINAL_OUTPUT = 1024 * 1024;

export function createTerminalCollection() {
  return { tabs: [], activeId: null, nextNumber: 1 };
}

export function createTerminalTab(collection, { cwd, id = `terminal-tab-${collection.nextNumber}` }) {
  const number = collection.nextNumber++;
  const tab = {
    id,
    number,
    title: `Terminal ${number}`,
    cwd,
    handle: null,
    command: null,
    output: "Starting project shell…\n",
    status: "starting",
    exitCode: null,
    unread: false,
    expectedExit: false,
  };
  collection.tabs.push(tab);
  collection.activeId = tab.id;
  return tab;
}

export function activeTerminal(collection) {
  return collection.tabs.find((tab) => tab.id === collection.activeId) || null;
}

export function terminalForHandle(collection, processHandle) {
  return collection.tabs.find((tab) => tab.handle === processHandle) || null;
}

export function activateTerminal(collection, id) {
  const tab = collection.tabs.find((entry) => entry.id === id);
  if (!tab) return null;
  collection.activeId = id;
  tab.unread = false;
  return tab;
}

export function removeTerminal(collection, id) {
  const index = collection.tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return null;
  const [removed] = collection.tabs.splice(index, 1);
  if (collection.activeId === id) {
    collection.activeId = collection.tabs[index]?.id || collection.tabs[index - 1]?.id || null;
    const active = activeTerminal(collection);
    if (active) active.unread = false;
  }
  return removed;
}

export function appendTerminalOutput(tab, chunk, { visible = false } = {}) {
  if (!tab || !chunk) return;
  tab.output = `${tab.output || ""}${chunk}`;
  if (tab.output.length > MAX_TERMINAL_OUTPUT) {
    tab.output = `[Earlier output trimmed]\n${tab.output.slice(-(MAX_TERMINAL_OUTPUT - 25))}`;
  }
  if (!visible) tab.unread = true;
}

export function runningTerminalCount(collection) {
  return collection.tabs.filter((tab) => tab.status === "running" || tab.status === "starting").length;
}

export function unreadTerminalCount(collection) {
  return collection.tabs.filter((tab) => tab.unread).length;
}
