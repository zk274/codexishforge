import fs from "node:fs";
import path from "node:path";

export const UPDATE_CHANNELS = Object.freeze(["stable", "beta"]);
export const DEFAULT_UPDATE_PREFERENCES = Object.freeze({
  channel: "stable",
  autoCheck: true,
});

export function normalizeUpdatePreferences(value = {}) {
  const candidate = value && typeof value === "object" ? value : {};
  return {
    channel: UPDATE_CHANNELS.includes(candidate.channel) ? candidate.channel : DEFAULT_UPDATE_PREFERENCES.channel,
    autoCheck: candidate.autoCheck !== false,
  };
}

export function updaterChannel(preferences) {
  return normalizeUpdatePreferences(preferences).channel === "beta" ? "beta" : "latest";
}

export function detectLinuxPackageType({
  packaged,
  env = process.env,
  execPath = process.execPath,
  resourcesPath = process.resourcesPath,
  readFile = fs.readFileSync,
} = {}) {
  if (!packaged) return "development";
  const snapRoot = typeof env.SNAP === "string" && path.isAbsolute(env.SNAP) ? path.normalize(env.SNAP) : null;
  const executable = typeof execPath === "string" && path.isAbsolute(execPath) ? path.normalize(execPath) : null;
  if (snapRoot && executable && (executable === snapRoot || executable.startsWith(`${snapRoot}${path.sep}`))) return "snap";
  if (typeof env.APPIMAGE === "string" && path.isAbsolute(env.APPIMAGE)) return "appimage";
  try {
    const packageType = readFile(path.join(resourcesPath, "package-type"), "utf8").trim().toLowerCase();
    if (["deb", "rpm", "pacman"].includes(packageType)) return packageType;
  } catch {}
  return "unknown";
}

function availability(packageType) {
  if (packageType === "development") return { supported: false, reason: "Update checks are available in packaged builds." };
  if (packageType === "snap") return { supported: false, reason: "Snap updates are managed by the Snap Store." };
  if (!["appimage", "deb", "rpm", "pacman"].includes(packageType)) {
    return { supported: false, reason: "This package format does not support in-app updates." };
  }
  return { supported: true, reason: null };
}

function cleanError(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown update error");
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

export class UpdateService {
  constructor({
    updater,
    currentVersion,
    packageType,
    preferences,
    onChange = () => {},
    log = () => {},
  }) {
    if (!updater || typeof updater.on !== "function") throw new TypeError("An updater event emitter is required");
    this.updater = updater;
    this.currentVersion = currentVersion;
    this.packageType = packageType;
    this.onChange = onChange;
    this.log = log;
    this.preferences = normalizeUpdatePreferences(preferences);
    const support = availability(packageType);
    this.state = {
      phase: support.supported ? "idle" : "unavailable",
      availableVersion: null,
      checkedAt: null,
      percent: null,
      transferred: null,
      total: null,
      error: null,
      reason: support.reason,
    };
    this.configureUpdater();
    this.bindEvents();
  }

  configureUpdater() {
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.allowPrerelease = this.preferences.channel === "beta";
    this.updater.channel = updaterChannel(this.preferences);
    this.updater.allowDowngrade = false;
  }

  bindEvents() {
    this.updater.on("checking-for-update", () => this.setState({ phase: "checking", error: null, reason: null }));
    this.updater.on("update-available", (info = {}) => {
      this.log("info", "updater.update_available", { version: info.version || null, channel: this.preferences.channel });
      this.setState({ phase: "available", availableVersion: info.version || null, checkedAt: new Date().toISOString(), error: null });
    });
    this.updater.on("update-not-available", (info = {}) => {
      this.log("info", "updater.update_not_available", { version: info.version || this.currentVersion, channel: this.preferences.channel });
      this.setState({ phase: "current", availableVersion: null, checkedAt: new Date().toISOString(), percent: null, error: null });
    });
    this.updater.on("download-progress", (progress = {}) => this.setState({
      phase: "downloading",
      percent: Number.isFinite(progress.percent) ? Math.max(0, Math.min(100, progress.percent)) : null,
      transferred: Number.isFinite(progress.transferred) ? progress.transferred : null,
      total: Number.isFinite(progress.total) ? progress.total : null,
      error: null,
    }));
    this.updater.on("update-downloaded", (info = {}) => {
      this.log("info", "updater.update_downloaded", { version: info.version || this.state.availableVersion });
      this.setState({ phase: "downloaded", availableVersion: info.version || this.state.availableVersion, percent: 100, error: null });
    });
    this.updater.on("error", (error) => {
      const message = cleanError(error);
      this.log("warn", "updater.error", { message, channel: this.preferences.channel });
      this.setState({ phase: "error", error: message });
    });
  }

  setState(updates) {
    this.state = { ...this.state, ...updates };
    this.onChange(this.snapshot());
  }

  snapshot() {
    const supported = availability(this.packageType).supported;
    return {
      currentVersion: this.currentVersion,
      packageType: this.packageType,
      supported,
      preferences: { ...this.preferences },
      ...this.state,
      canCheck: supported && !["checking", "downloading", "downloaded"].includes(this.state.phase),
      canDownload: supported && this.state.phase === "available",
      canInstall: supported && this.state.phase === "downloaded",
    };
  }

  setPreferences(value) {
    if (["downloading", "downloaded"].includes(this.state.phase)) throw new Error("Finish or restart the app before changing update channels.");
    this.preferences = normalizeUpdatePreferences(value);
    this.configureUpdater();
    this.setState({
      phase: availability(this.packageType).supported ? "idle" : "unavailable",
      availableVersion: null,
      checkedAt: null,
      percent: null,
      transferred: null,
      total: null,
      error: null,
      reason: availability(this.packageType).reason,
    });
    return this.snapshot();
  }

  async check() {
    if (!this.snapshot().canCheck) throw new Error(this.state.reason || "An update check is already in progress.");
    this.setState({ phase: "checking", error: null, reason: null });
    try {
      await this.updater.checkForUpdates();
    } catch (error) {
      if (this.state.phase !== "error") this.setState({ phase: "error", error: cleanError(error) });
      throw error;
    }
    return this.snapshot();
  }

  async download() {
    if (!this.snapshot().canDownload) throw new Error("No update is ready to download.");
    this.setState({ phase: "downloading", percent: 0, transferred: 0, total: null, error: null });
    try {
      await this.updater.downloadUpdate();
    } catch (error) {
      if (this.state.phase !== "error") this.setState({ phase: "error", error: cleanError(error) });
      throw error;
    }
    return this.snapshot();
  }

  install() {
    if (!this.snapshot().canInstall) throw new Error("No downloaded update is ready to install.");
    this.updater.quitAndInstall(false, true);
  }
}
