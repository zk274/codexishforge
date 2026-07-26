import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const AUTOSTART_FILENAME = "community.codexlinux.desktop";
export const AUTOSTART_MARKER = "X-Codex-Linux-Managed=true";

function assertDesktopValue(value, label) {
  if (typeof value !== "string" || !value || value.includes("\0") || /[\r\n]/.test(value)) {
    throw new TypeError(`${label} must be a non-empty, single-line string`);
  }
  return value;
}

export function quoteDesktopExecArgument(value) {
  const safeValue = assertDesktopValue(value, "Desktop Exec argument")
    .replaceAll("%", "%%")
    .replaceAll("\\", "\\\\\\\\")
    .replaceAll("\"", "\\\"")
    .replaceAll("`", "\\`")
    .replaceAll("$", "\\$");
  return `"${safeValue}"`;
}

export function resolveXdgConfigHome({ xdgConfigHome, home }) {
  if (typeof xdgConfigHome === "string" && path.isAbsolute(xdgConfigHome)) return path.normalize(xdgConfigHome);
  if (typeof home !== "string" || !path.isAbsolute(home)) throw new TypeError("An absolute home directory is required");
  return path.join(home, ".config");
}

export function resolveAutostartExecutable({ execPath, env = process.env, pathExists = fs.existsSync }) {
  const appImage = env.APPIMAGE;
  if (typeof appImage === "string" && path.isAbsolute(appImage) && pathExists(appImage)) return path.normalize(appImage);

  const snapName = env.SNAP_INSTANCE_NAME || env.SNAP_NAME;
  const snapRoot = typeof env.SNAP === "string" && path.isAbsolute(env.SNAP) ? path.normalize(env.SNAP) : null;
  const runningInsideSnap = snapRoot && path.isAbsolute(execPath) && (
    path.normalize(execPath) === snapRoot || path.normalize(execPath).startsWith(`${snapRoot}${path.sep}`)
  );
  if (runningInsideSnap && typeof snapName === "string" && /^[A-Za-z0-9._-]+$/.test(snapName)) {
    const snapLauncher = path.join("/snap/bin", snapName);
    if (pathExists(snapLauncher)) return snapLauncher;
  }

  const fallback = assertDesktopValue(execPath, "Application executable");
  if (!path.isAbsolute(fallback)) throw new TypeError("Application executable must be an absolute path");
  return path.normalize(fallback);
}

export function renderAutostartDesktop({ executable, name = "Codex Linux Community" }) {
  if (!path.isAbsolute(executable)) throw new TypeError("The autostart executable must be an absolute path");
  const safeName = assertDesktopValue(name, "Application name");
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Version=1.0",
    `Name=${safeName}`,
    "Comment=Start Codex Linux Community in the background",
    `Exec=${quoteDesktopExecArgument(executable)} --autostart`,
    "Terminal=false",
    "Hidden=false",
    "StartupNotify=false",
    "X-GNOME-Autostart-enabled=true",
    AUTOSTART_MARKER,
    "",
  ].join("\n");
}

function desktopBoolean(contents, key) {
  const match = contents.match(new RegExp(`^${key}\\s*=\\s*(true|false)\\s*$`, "im"));
  return match ? match[1].toLowerCase() === "true" : null;
}

export class XdgAutostart {
  constructor({ directory, executable, available = true, testMode = false, fsModule = fs }) {
    if (typeof directory !== "string" || !path.isAbsolute(directory)) throw new TypeError("The autostart directory must be absolute");
    if (typeof executable !== "string" || !path.isAbsolute(executable)) throw new TypeError("The autostart executable must be absolute");
    this.directory = path.normalize(directory);
    this.executable = path.normalize(executable);
    this.available = available;
    this.testMode = testMode;
    this.fs = fsModule;
    this.filePath = path.join(this.directory, AUTOSTART_FILENAME);
  }

  expectedContents() {
    return renderAutostartDesktop({ executable: this.executable });
  }

  status() {
    const base = {
      available: this.available,
      enabled: false,
      managed: false,
      conflict: false,
      stale: false,
      testMode: this.testMode,
      filePath: this.filePath,
      executable: this.executable,
      reason: null,
    };
    if (!this.available) {
      return { ...base, reason: "Launch at login is available in packaged builds." };
    }

    let contents;
    try {
      contents = this.fs.readFileSync(this.filePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return base;
      return { ...base, reason: `Unable to inspect the autostart entry: ${error.message}` };
    }

    const managed = new RegExp(`^${AUTOSTART_MARKER}\\s*$`, "m").test(contents);
    if (!managed) {
      return {
        ...base,
        conflict: true,
        reason: "An autostart entry with this name already exists and is not managed by Codex Linux Community.",
      };
    }

    const enabled = desktopBoolean(contents, "Hidden") !== true;
    const stale = enabled && contents !== this.expectedContents();
    return {
      ...base,
      enabled,
      managed: true,
      stale,
      reason: enabled && stale ? "The managed autostart entry needs to be refreshed." : null,
    };
  }

  setEnabled(enabled) {
    if (typeof enabled !== "boolean") throw new TypeError("Launch at login must be enabled or disabled");
    if (!this.available) throw new Error("Launch at login is available only in packaged builds.");
    const current = this.status();
    if (current.conflict) throw new Error(current.reason);

    if (!enabled) {
      if (current.managed) this.fs.unlinkSync(this.filePath);
      return this.status();
    }

    this.fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const temporaryPath = path.join(this.directory, `.${AUTOSTART_FILENAME}.${randomUUID()}.tmp`);
    try {
      this.fs.writeFileSync(temporaryPath, this.expectedContents(), { encoding: "utf8", mode: 0o600, flag: "wx" });
      this.fs.renameSync(temporaryPath, this.filePath);
    } finally {
      try { this.fs.unlinkSync(temporaryPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    }
    return this.status();
  }

  refresh() {
    const current = this.status();
    if (current.managed && current.enabled && current.stale) return this.setEnabled(true);
    return current;
  }
}
