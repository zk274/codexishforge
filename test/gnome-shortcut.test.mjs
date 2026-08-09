import assert from "node:assert/strict";
import test from "node:test";
import {
  CODEX_GNOME_SHORTCUT_COMMAND,
  CODEX_GNOME_SHORTCUT_NAME,
  CODEX_GNOME_SHORTCUT_PATH,
  CODEX_QUICK_PROMPT_LINK,
  GNOME_CUSTOM_KEYBINDING_SCHEMA,
  GNOME_CUSTOM_KEYBINDINGS_KEY,
  GNOME_MEDIA_KEYS_SCHEMA,
  GnomeShortcutController,
  detectGnomeWaylandSession,
  isGnomeWaylandSession,
  parseGSettingsStringArray,
  quickPromptCommand,
  quoteGnomeCommandArgument,
  serializeGSettingsString,
  serializeGSettingsStringArray,
  toGnomeShortcutBinding,
} from "../src/main/gnome-shortcut.mjs";

const GNOME_WAYLAND_ENV = Object.freeze({
  XDG_CURRENT_DESKTOP: "ubuntu:GNOME",
  XDG_SESSION_TYPE: "wayland",
  WAYLAND_DISPLAY: "wayland-0",
});
const OWNED_SCHEMA = `${GNOME_CUSTOM_KEYBINDING_SCHEMA}:${CODEX_GNOME_SHORTCUT_PATH}`;

function createExecutor(paths, { async = false } = {}) {
  const calls = [];
  const execute = (file, args, options) => {
    calls.push({ file, args, options });
    const result = args[0] === "get" ? { stdout: `${paths}\n` } : { stdout: "" };
    return async ? Promise.resolve(result) : result;
  };
  return { calls, execute };
}

test("GNOME Wayland detection is conservative and handles Ubuntu desktop markers", () => {
  assert.deepEqual(detectGnomeWaylandSession(GNOME_WAYLAND_ENV), {
    isGnome: true,
    isWayland: true,
    supported: true,
  });
  assert.equal(isGnomeWaylandSession({ XDG_CURRENT_DESKTOP: "GNOME", WAYLAND_DISPLAY: "wayland-1" }), true);
  assert.equal(isGnomeWaylandSession({ XDG_CURRENT_DESKTOP: "GNOME", XDG_SESSION_TYPE: "x11", WAYLAND_DISPLAY: "wayland-1" }), false);
  assert.equal(isGnomeWaylandSession({ XDG_CURRENT_DESKTOP: "KDE", XDG_SESSION_TYPE: "wayland" }), false);
  assert.equal(isGnomeWaylandSession({ GNOME_SHELL_SESSION_MODE: "ubuntu", XDG_SESSION_TYPE: "wayland" }), true);
});

test("supported Electron accelerators map to GTK/GNOME binding strings", () => {
  assert.equal(toGnomeShortcutBinding("CommandOrControl+Shift+Space"), "<Primary><Shift>space");
  assert.equal(toGnomeShortcutBinding("Alt+Shift+Space"), "<Alt><Shift>space");
  assert.equal(toGnomeShortcutBinding("CommandOrControl+Alt+Space"), "<Primary><Alt>space");
  assert.equal(toGnomeShortcutBinding("CommandOrControl+Shift+J"), "<Primary><Shift>j");
  assert.equal(toGnomeShortcutBinding("Control+Q"), null);
  assert.equal(toGnomeShortcutBinding(null), null);
});

test("builds a shell-safe command for the running packaged executable", () => {
  assert.equal(quoteGnomeCommandArgument("/opt/Codex Linux/app"), "'/opt/Codex Linux/app'");
  assert.equal(quoteGnomeCommandArgument("/tmp/Codex's AppImage"), "'/tmp/Codex'\\''s AppImage'");
  assert.equal(
    quickPromptCommand("/opt/Codex Linux/app"),
    `'/opt/Codex Linux/app' '${CODEX_QUICK_PROMPT_LINK}'`,
  );
  assert.throws(() => quickPromptCommand("/tmp/bad\npath"), /single-line/);
});

test("GSettings string arrays are parsed and serialized without evaluation", () => {
  assert.deepEqual(parseGSettingsStringArray("@as []\n"), []);
  assert.deepEqual(
    parseGSettingsStringArray("['/one/', \"/two/\", '/quote\\\'and\\\\slash/']"),
    ["/one/", "/two/", "/quote'and\\slash/"],
  );
  assert.equal(serializeGSettingsString("a'b\\c\n"), "'a\\'b\\\\c\\n'");
  assert.equal(serializeGSettingsStringArray(["/one/", "/two/"]), "['/one/', '/two/']");
  assert.throws(() => parseGSettingsStringArray("$(touch /tmp/not-run)"), /Invalid GSettings/);
  assert.throws(() => parseGSettingsStringArray("['/one/',]"), /Trailing commas/);
  assert.throws(() => serializeGSettingsString("bad\0value"), /NUL/);
});

test("install configures the owned binding and appends its path without changing existing paths", async () => {
  const executor = createExecutor("['/existing/one/', '/existing/two/']");
  const controller = new GnomeShortcutController({ execFile: executor.execute, env: GNOME_WAYLAND_ENV });

  assert.deepEqual(await controller.install("CommandOrControl+Shift+Space"), {
    installed: true,
    added: true,
    binding: "<Primary><Shift>space",
    path: CODEX_GNOME_SHORTCUT_PATH,
  });
  assert.deepEqual(executor.calls.map(({ file }) => file), ["gsettings", "gsettings", "gsettings", "gsettings", "gsettings"]);
  assert.deepEqual(executor.calls.map(({ args }) => args), [
    ["get", GNOME_MEDIA_KEYS_SCHEMA, GNOME_CUSTOM_KEYBINDINGS_KEY],
    ["set", OWNED_SCHEMA, "name", serializeGSettingsString(CODEX_GNOME_SHORTCUT_NAME)],
    ["set", OWNED_SCHEMA, "command", serializeGSettingsString(CODEX_GNOME_SHORTCUT_COMMAND)],
    ["set", OWNED_SCHEMA, "binding", "'<Primary><Shift>space'"],
    ["set", GNOME_MEDIA_KEYS_SCHEMA, GNOME_CUSTOM_KEYBINDINGS_KEY,
      serializeGSettingsStringArray(["/existing/one/", "/existing/two/", CODEX_GNOME_SHORTCUT_PATH])],
  ]);
  for (const { options } of executor.calls) assert.equal(options.shell, false);
});

test("install updates an existing owned binding without rewriting the path list", async () => {
  const executor = createExecutor(`['/existing/', '${CODEX_GNOME_SHORTCUT_PATH}', '/after/']`, { async: true });
  const controller = new GnomeShortcutController({ execFile: executor.execute, env: GNOME_WAYLAND_ENV });

  const result = await controller.install("Alt+Shift+Space");
  assert.equal(result.installed, true);
  assert.equal(result.added, false);
  assert.equal(result.binding, "<Alt><Shift>space");
  assert.equal(executor.calls.length, 4);
  assert.deepEqual(executor.calls.at(-1).args, ["set", OWNED_SCHEMA, "binding", "'<Alt><Shift>space'"]);
});

test("install stores an injected packaged-app command", async () => {
  const executor = createExecutor("@as []");
  const command = quickPromptCommand("/apps/Codex Linux.AppImage");
  const controller = new GnomeShortcutController({
    execFile: executor.execute,
    env: GNOME_WAYLAND_ENV,
    command,
  });

  assert.equal((await controller.install("CommandOrControl+Shift+Space")).installed, true);
  assert.deepEqual(executor.calls[2].args, ["set", OWNED_SCHEMA, "command", serializeGSettingsString(command)]);
});

test("callback-style execFile implementations wait for command output", async () => {
  const calls = [];
  const execFile = (file, args, options, callback) => {
    calls.push({ file, args, options });
    queueMicrotask(() => callback(null, args[0] === "get" ? "@as []\n" : "", ""));
    return { stdout: { readable: true }, once() {} };
  };
  const controller = new GnomeShortcutController({ execFile, env: GNOME_WAYLAND_ENV });
  const result = await controller.install("CommandOrControl+Alt+Space");
  assert.equal(result.installed, true);
  assert.equal(result.binding, "<Primary><Alt>space");
  assert.equal(calls.length, 5);
});

test("remove deletes every owned path occurrence, preserves all other paths, and resets only owned keys", async () => {
  const executor = createExecutor(`['/before/', '${CODEX_GNOME_SHORTCUT_PATH}', '/after/', '${CODEX_GNOME_SHORTCUT_PATH}']`);
  const controller = new GnomeShortcutController({
    execFile: executor.execute,
    env: { XDG_CURRENT_DESKTOP: "GNOME", XDG_SESSION_TYPE: "x11" },
  });

  assert.deepEqual(await controller.remove(), { removed: true, path: CODEX_GNOME_SHORTCUT_PATH });
  assert.deepEqual(executor.calls.map(({ args }) => args), [
    ["get", GNOME_MEDIA_KEYS_SCHEMA, GNOME_CUSTOM_KEYBINDINGS_KEY],
    ["set", GNOME_MEDIA_KEYS_SCHEMA, GNOME_CUSTOM_KEYBINDINGS_KEY, "['/before/', '/after/']"],
    ["reset", OWNED_SCHEMA, "name"],
    ["reset", OWNED_SCHEMA, "command"],
    ["reset", OWNED_SCHEMA, "binding"],
  ]);
});

test("unsupported sessions and accelerators never invoke gsettings", async () => {
  const executor = createExecutor("@as []");
  const kde = new GnomeShortcutController({
    execFile: executor.execute,
    env: { XDG_CURRENT_DESKTOP: "KDE", XDG_SESSION_TYPE: "wayland" },
  });
  assert.equal((await kde.install("CommandOrControl+Shift+Space")).reason, "unsupported-session");
  assert.equal((await kde.remove()).reason, "unsupported-desktop");

  const gnome = new GnomeShortcutController({ execFile: executor.execute, env: GNOME_WAYLAND_ENV });
  assert.equal((await gnome.install("Control+Q")).reason, "unsupported-accelerator");
  assert.equal(executor.calls.length, 0);
});

test("malformed current settings abort installation before any writes", async () => {
  const executor = createExecutor("not-an-array");
  const controller = new GnomeShortcutController({ execFile: executor.execute, env: GNOME_WAYLAND_ENV });
  await assert.rejects(controller.install("CommandOrControl+Shift+Space"), /Invalid GSettings/);
  assert.equal(executor.calls.length, 1);
  assert.equal(executor.calls[0].args[0], "get");
});
