import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AUTOSTART_FILENAME,
  AUTOSTART_MARKER,
  XdgAutostart,
  quoteDesktopExecArgument,
  renderAutostartDesktop,
  resolveAutostartExecutable,
  resolveXdgConfigHome,
} from "../src/main/autostart.mjs";

function temporaryAutostart(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-autostart-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "config", "autostart");
  const executable = path.join(root, "Codex Linux Community.AppImage");
  fs.writeFileSync(executable, "");
  return { root, directory, executable };
}

test("resolves XDG config home with a home-directory fallback", () => {
  assert.equal(resolveXdgConfigHome({ xdgConfigHome: "/custom/config", home: "/home/example" }), "/custom/config");
  assert.equal(resolveXdgConfigHome({ xdgConfigHome: "relative", home: "/home/example" }), "/home/example/.config");
});

test("quotes desktop Exec arguments and rejects multiline values", () => {
  assert.equal(
    quoteDesktopExecArgument('/opt/Codex $Linux/%build`/"app"'),
    '"/opt/Codex \\$Linux/%%build\\`/\\\"app\\\""',
  );
  assert.throws(() => quoteDesktopExecArgument("/opt/codex\nmalicious"), /single-line/);
});

test("renders a managed background autostart desktop entry", () => {
  const contents = renderAutostartDesktop({ executable: "/opt/Codex Linux/codex" });
  assert.match(contents, /^\[Desktop Entry\]$/m);
  assert.match(contents, /^Exec="\/opt\/Codex Linux\/codex" --autostart$/m);
  assert.match(contents, new RegExp(`^${AUTOSTART_MARKER}$`, "m"));
  assert.match(contents, /^Terminal=false$/m);
});

test("enables, inspects, refreshes, and disables a managed entry", (t) => {
  const fixture = temporaryAutostart(t);
  const manager = new XdgAutostart({ directory: fixture.directory, executable: fixture.executable, testMode: true });

  assert.deepEqual(manager.status().enabled, false);
  const enabled = manager.setEnabled(true);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.managed, true);
  assert.equal(enabled.stale, false);
  assert.equal(fs.statSync(path.join(fixture.directory, AUTOSTART_FILENAME)).mode & 0o777, 0o600);

  fs.appendFileSync(manager.filePath, "X-Test-Stale=true\n");
  assert.equal(manager.status().stale, true);
  assert.equal(manager.refresh().stale, false);
  assert.doesNotMatch(fs.readFileSync(manager.filePath, "utf8"), /X-Test-Stale/);

  const disabled = manager.setEnabled(false);
  assert.equal(disabled.enabled, false);
  assert.equal(fs.existsSync(manager.filePath), false);
});

test("never overwrites or removes an unmanaged same-name entry", (t) => {
  const fixture = temporaryAutostart(t);
  fs.mkdirSync(fixture.directory, { recursive: true });
  const filePath = path.join(fixture.directory, AUTOSTART_FILENAME);
  fs.writeFileSync(filePath, "[Desktop Entry]\nType=Application\nExec=/usr/bin/example\n");
  const manager = new XdgAutostart({ directory: fixture.directory, executable: fixture.executable });

  assert.equal(manager.status().conflict, true);
  assert.throws(() => manager.setEnabled(true), /not managed/);
  assert.throws(() => manager.setEnabled(false), /not managed/);
  assert.match(fs.readFileSync(filePath, "utf8"), /\/usr\/bin\/example/);
});

test("does not re-enable a deliberately hidden managed entry", (t) => {
  const fixture = temporaryAutostart(t);
  const manager = new XdgAutostart({ directory: fixture.directory, executable: fixture.executable });
  manager.setEnabled(true);
  fs.writeFileSync(manager.filePath, manager.expectedContents().replace("Hidden=false", "Hidden=true"));

  const status = manager.refresh();
  assert.equal(status.managed, true);
  assert.equal(status.enabled, false);
  assert.equal(status.stale, false);
  assert.match(fs.readFileSync(manager.filePath, "utf8"), /^Hidden=true$/m);
});

test("unavailable development manager refuses to mutate the filesystem", (t) => {
  const fixture = temporaryAutostart(t);
  const manager = new XdgAutostart({ directory: fixture.directory, executable: fixture.executable, available: false });
  assert.equal(manager.status().available, false);
  assert.throws(() => manager.setEnabled(true), /packaged builds/);
  assert.equal(fs.existsSync(manager.filePath), false);
});

test("prefers stable AppImage and Snap launchers before the runtime executable", () => {
  const existing = new Set(["/apps/Codex.AppImage", "/snap/bin/codex-linux"]);
  const pathExists = (candidate) => existing.has(candidate);
  assert.equal(resolveAutostartExecutable({
    execPath: "/runtime/electron",
    env: { APPIMAGE: "/apps/Codex.AppImage" },
    pathExists,
  }), "/apps/Codex.AppImage");
  assert.equal(resolveAutostartExecutable({
    execPath: "/snap/codex-linux/current/usr/lib/codex-linux",
    env: { SNAP: "/snap/codex-linux/current", SNAP_INSTANCE_NAME: "codex-linux" },
    pathExists,
  }), "/snap/bin/codex-linux");
  assert.equal(resolveAutostartExecutable({
    execPath: "/usr/lib/codex-linux/codex-linux",
    env: {},
    pathExists,
  }), "/usr/lib/codex-linux/codex-linux");
});

test("ignores Snap variables inherited from a parent application", () => {
  assert.equal(resolveAutostartExecutable({
    execPath: "/opt/codex-linux/codex-linux",
    env: { SNAP: "/snap/code/current", SNAP_INSTANCE_NAME: "code" },
    pathExists: () => true,
  }), "/opt/codex-linux/codex-linux");
});
