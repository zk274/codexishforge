import { app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, shell, Tray } from "electron";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { CodexClient } from "./codex-client.mjs";
import { mergeDesktopPreferences, normalizeDesktopPreferences, shortcutCandidates, shouldHideOnClose } from "./desktop-preferences.mjs";
import { resolveCodexCommand, validateCodexCommand } from "./codex-locator.mjs";
import { GitService } from "./git-service.mjs";
import { inspectCodexProtocol, unknownProtocolCompatibility } from "./protocol-compatibility.mjs";
import { StructuredLogger } from "./structured-logger.mjs";
import { createTrayIconPng } from "./tray-icon.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let client = null;
let discovery = null;
let mainWindow;
let companionWindow;
let activeThreadContext = null;
let captureSources = new Map();
let logger = null;
let shortcutRegistered = false;
let shortcutAccelerator = null;
let shortcutRequested = null;
let shortcutError = null;
let tray = null;
let trayError = null;
let isQuitting = false;
let compatibility = unknownProtocolCompatibility();
let cachedCliVersion = null;
let sessionMarkerPath = null;
let previousUncleanShutdown = false;
let exitingAfterCrash = false;
const startedAt = Date.now();
const execFileAsync = promisify(execFile);
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);
const git = new GitService();

function sendEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("codex:event", payload);
}

function log(level, event, details = {}) {
  if (logger) return logger.log(level, event, details);
  if (level === "error") console.error(event, details);
  return null;
}

function attachmentDirectory() {
  const directory = path.join(app.getPath("userData"), "attachments");
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function attachmentInfo(candidate) {
  if (!path.isAbsolute(candidate)) throw new Error("Attachment paths must be absolute");
  const realPath = fs.realpathSync(candidate);
  const stat = fs.statSync(realPath);
  if (!stat.isFile()) throw new Error("Only files can be attached");
  const isImage = imageExtensions.has(path.extname(realPath).toLowerCase());
  let preview = null;
  if (isImage && stat.size <= 25 * 1024 * 1024) {
    const image = nativeImage.createFromPath(realPath);
    if (!image.isEmpty()) preview = image.resize({ width: 240, quality: "good" }).toDataURL();
  }
  return { path: realPath, name: path.basename(realPath), size: stat.size, kind: isImage ? "image" : "file", preview };
}

function saveImage(image, prefix) {
  if (!image || image.isEmpty()) throw new Error("No image was available");
  const filePath = path.join(attachmentDirectory(), `${prefix}-${randomUUID()}.png`);
  fs.writeFileSync(filePath, image.toPNG(), { mode: 0o600 });
  return attachmentInfo(filePath);
}

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), "utf8")); }
  catch { return {}; }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  const temporaryPath = `${settingsPath()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, settingsPath());
}

function desktopPreferences() {
  return normalizeDesktopPreferences(readSettings().desktop);
}

function shortcutSnapshot() {
  return {
    requested: shortcutRequested,
    accelerator: shortcutAccelerator,
    registered: shortcutRegistered,
    error: shortcutError,
  };
}

function traySnapshot() {
  return { enabled: desktopPreferences().trayEnabled, available: Boolean(tray), error: trayError };
}

function desktopState() {
  return {
    preferences: desktopPreferences(),
    shortcut: shortcutSnapshot(),
    tray: traySnapshot(),
    environment: {
      desktop: process.env.XDG_CURRENT_DESKTOP || null,
      sessionType: process.env.XDG_SESSION_TYPE || null,
    },
  };
}

function rememberThread(context) {
  activeThreadContext = context;
  writeSettings({ ...readSettings(), lastThreadId: context?.id || null });
}

function activeRepository(cwd) {
  if (!activeThreadContext?.cwd) throw new Error("Open a Codex thread before changing Git state");
  if (fs.realpathSync(cwd) !== fs.realpathSync(activeThreadContext.cwd)) throw new Error("Git changes are limited to the active thread's repository");
  return cwd;
}

function bindClientEvents(activeClient) {
  activeClient.on("notification", (message) => {
    if (message.method === "thread/name/updated" && activeThreadContext?.id === message.params.threadId) activeThreadContext.title = message.params.name || activeThreadContext.title;
    sendEvent({ kind: "notification", ...message });
  });
  activeClient.on("serverRequest", (message) => {
    if (message.method === "currentTime/read") activeClient.respond(message.id, { currentTimeAt: Math.floor(Date.now() / 1000) });
    else sendEvent({ kind: "request", ...message });
  });
  activeClient.on("status", (status) => { log(status.connected ? "info" : "error", "codex.status", status); sendEvent({ kind: "status", ...status }); });
  activeClient.on("log", (message) => { log("warn", "codex.stderr", { message }); sendEvent({ kind: "log", message }); });
  activeClient.on("protocolError", (details) => {
    const missingMethods = [...new Set([...(compatibility.missingMethods || []), details.method])];
    compatibility = {
      ...compatibility,
      status: "incompatible",
      missingMethod: missingMethods[0],
      missingMethods,
      message: `The running Codex app-server does not support ${details.method}.`,
    };
    log("error", "codex.protocol_incompatible", details);
    sendEvent({ kind: "compatibility", compatibility });
  });
}

function getClient() {
  if (client) return client;
  discovery = resolveCodexCommand({ configuredPath: readSettings().codexCliPath || null });
  if (!discovery.command) { log("error", "codex.cli_not_found", { searched: discovery.searched }); return null; }
  log("info", "codex.cli_discovered", { path: discovery.command });
  client = new CodexClient({ command: discovery.command });
  bindClientEvents(client);
  return client;
}

function resetClient() {
  client?.close();
  client = null;
  discovery = null;
  cachedCliVersion = null;
  compatibility = unknownProtocolCompatibility();
}

function cliStatus() {
  if (!discovery) discovery = resolveCodexCommand({ configuredPath: readSettings().codexCliPath || null });
  return { found: Boolean(discovery.command), path: discovery.command, searched: discovery.searched };
}

async function ensureConnected() {
  const activeClient = getClient();
  if (!activeClient) {
    const error = new Error("Codex CLI was not found. Choose the Codex executable or install the CLI, then retry.");
    error.code = "CODEX_NOT_FOUND";
    throw error;
  }
  try { await activeClient.connect(); }
  catch (error) { log("error", "codex.connect_failed", { message: error.message, code: error.code }); throw error; }
  return activeClient;
}

async function bootstrapData() {
  const status = cliStatus();
  compatibility = await inspectCodexProtocol(status.path);
  log(compatibility.status === "compatible" ? "info" : compatibility.status === "partial" ? "warn" : "error", "codex.protocol_preflight", compatibility);
  sendEvent({ kind: "compatibility", compatibility });
  if (compatibility.status === "incompatible") {
    const error = new Error(compatibility.message);
    error.code = "CODEX_PROTOCOL_INCOMPATIBLE";
    error.method = compatibility.missingMethod;
    throw error;
  }
  const activeClient = await ensureConnected();
  const [threads, models, account] = await Promise.all([
    activeClient.request("thread/list", { limit: 100, sortKey: "updated_at", sortDirection: "desc" }),
    activeClient.request("model/list", { limit: 100 }),
    activeClient.request("account/read", { refreshToken: false }),
  ]);
  log("info", "codex.bootstrap_complete", { threads: threads.data.length, models: models.data.length, authenticated: Boolean(account.account) });
  return { threads: threads.data, models: models.data, account, cli: cliStatus(), compatibility, desktop: desktopState(), lastThreadId: readSettings().lastThreadId || null };
}

async function cliVersion() {
  const status = cliStatus();
  if (!status.path) return null;
  if (cachedCliVersion) return cachedCliVersion;
  try {
    const result = await execFileAsync(status.path, ["--version"], { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 });
    cachedCliVersion = result.stdout.trim() || result.stderr.trim() || null;
  } catch (error) { cachedCliVersion = `Unable to read: ${error.message}`; }
  return cachedCliVersion;
}

async function diagnosticsSnapshot() {
  const status = cliStatus();
  return {
    generatedAt: new Date().toISOString(),
    application: { version: app.getVersion(), packaged: app.isPackaged, uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), previousUncleanShutdown, userData: app.getPath("userData") },
    runtime: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
    system: { platform: process.platform, arch: process.arch, release: os.release(), desktop: process.env.XDG_CURRENT_DESKTOP || null, sessionType: process.env.XDG_SESSION_TYPE || null },
    codex: { found: status.found, path: status.path, version: await cliVersion(), connected: Boolean(client?.ready), server: client?.serverInfo || null, compatibility },
    quickPrompt: { ...shortcutSnapshot(), environment: desktopState().environment },
    tray: traySnapshot(),
    activeThread: activeThreadContext ? { id: activeThreadContext.id, project: path.basename(activeThreadContext.cwd), title: activeThreadContext.title } : null,
    logFile: logger?.filePath || null,
  };
}

function registerIpc() {
  ipcMain.handle("codex:bootstrap", async () => {
    try { return await bootstrapData(); }
    catch (error) { log("error", "codex.bootstrap_failed", { message: error.message, code: error.code, method: error.method }); throw error; }
  });

  ipcMain.handle("codex:listThreads", async (_event, params = {}) => {
    const activeClient = await ensureConnected();
    return activeClient.request("thread/list", { limit: 100, sortKey: "updated_at", sortDirection: "desc", ...params });
  });

  ipcMain.handle("codex:startThread", async (_event, params) => {
    const activeClient = await ensureConnected();
    if (!path.isAbsolute(params.cwd)) throw new Error("Choose an absolute project folder");
    const response = await activeClient.request("thread/start", {
      cwd: params.cwd,
      model: params.model || null,
      approvalPolicy: params.approvalPolicy || "on-request",
      sandbox: params.sandbox || "workspace-write",
      sessionStartSource: "startup",
      threadSource: "codex-linux-community",
    });
    rememberThread({ id: response.thread.id, cwd: response.thread.cwd, title: response.thread.name || response.thread.preview || "New thread" });
    return response;
  });

  ipcMain.handle("codex:resumeThread", async (_event, threadId) => {
    const activeClient = await ensureConnected();
    const response = await activeClient.request("thread/resume", { threadId });
    rememberThread({ id: response.thread.id, cwd: response.thread.cwd, title: response.thread.name || response.thread.preview || "Codex thread" });
    return response;
  });

  ipcMain.handle("codex:sendTurn", async (_event, params) => {
    const activeClient = await ensureConnected();
    return activeClient.request("turn/start", {
      threadId: params.threadId,
      input: [
        ...(params.text ? [{ type: "text", text: params.text, text_elements: [] }] : []),
        ...(params.attachments || []).map((attachment) => {
          const info = attachmentInfo(attachment.path);
          return info.kind === "image" ? { type: "localImage", path: info.path } : { type: "mention", name: info.name, path: info.path };
        }),
      ],
      model: params.model || null,
      effort: params.effort || null,
    });
  });

  ipcMain.handle("codex:interruptTurn", async (_event, params) => {
    const activeClient = await ensureConnected();
    return activeClient.request("turn/interrupt", params);
  });

  ipcMain.handle("codex:answerRequest", (_event, { id, result }) => {
    getClient()?.respond(id, result);
    return true;
  });

  ipcMain.handle("codex:rejectRequest", (_event, { id, message }) => {
    getClient()?.reject(id, -32000, message || "Request was not supported by this client");
    return true;
  });

  ipcMain.handle("codex:cliStatus", () => cliStatus());

  ipcMain.handle("codex:chooseCli", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Locate the Codex CLI",
      message: "Select the executable named codex",
      properties: ["openFile"],
    });
    if (result.canceled) return null;
    const selectedPath = validateCodexCommand(result.filePaths[0]);
    writeSettings({ ...readSettings(), codexCliPath: selectedPath });
    resetClient();
    return bootstrapData();
  });

  ipcMain.handle("codex:loginChatGPT", async () => {
    const activeClient = await ensureConnected();
    const response = await activeClient.request("account/login/start", {
      type: "chatgpt",
      codexStreamlinedLogin: true,
      useHostedLoginSuccessPage: true,
      appBrand: "codex",
    });
    if (response.type !== "chatgpt") throw new Error("Codex returned an unexpected login method");
    const url = new URL(response.authUrl);
    if (url.protocol !== "https:") throw new Error("Codex returned an invalid login URL");
    await shell.openExternal(url.toString());
    return { loginId: response.loginId };
  });

  ipcMain.handle("codex:readAccount", async () => {
    const activeClient = await ensureConnected();
    return activeClient.request("account/read", { refreshToken: true });
  });

  ipcMain.handle("codex:logout", async () => {
    const activeClient = await ensureConnected();
    await activeClient.request("account/logout");
    return activeClient.request("account/read", { refreshToken: false });
  });

  ipcMain.handle("desktop:chooseFolder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("desktop:chooseAttachments", async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: "Attach files", properties: ["openFile", "multiSelections"] });
    return result.canceled ? [] : result.filePaths.map(attachmentInfo);
  });

  ipcMain.handle("desktop:prepareAttachments", (_event, paths) => (paths || []).slice(0, 20).map(attachmentInfo));

  ipcMain.handle("desktop:clipboardImage", () => {
    const image = clipboard.readImage();
    return image.isEmpty() ? null : saveImage(image, "clipboard");
  });

  ipcMain.handle("desktop:captureSources", async () => {
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 1920, height: 1080 }, fetchWindowIcons: true });
    captureSources = new Map(sources.map((source) => [source.id, source]));
    return sources.map((source) => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL(), icon: source.appIcon?.toDataURL() || null }));
  });

  ipcMain.handle("desktop:captureSource", (_event, sourceId) => {
    const source = captureSources.get(sourceId);
    if (!source) throw new Error("That screenshot source is no longer available");
    captureSources.clear();
    return saveImage(source.thumbnail, "screenshot");
  });

  ipcMain.handle("desktop:getPreferences", () => desktopState());
  ipcMain.handle("desktop:updatePreferences", (_event, updates = {}) => {
    const settings = readSettings();
    const preferences = mergeDesktopPreferences(settings.desktop, updates);
    writeSettings({ ...settings, desktop: preferences });
    registerQuickPromptShortcut(preferences);
    updateTray(preferences);
    const result = desktopState();
    log(result.shortcut.registered || !preferences.quickPromptShortcut ? "info" : "warn", "desktop.preferences_updated", result);
    sendEvent({ kind: "desktopPreferences", desktop: result });
    return result;
  });

  ipcMain.handle("git:status", async (_event, cwd) => {
    return git.status(cwd);
  });

  ipcMain.handle("git:diff", async (_event, { cwd, staged = false, file = null }) => git.diff(cwd, { staged, file }));
  ipcMain.handle("git:stage", async (_event, { cwd, paths }) => git.stage(activeRepository(cwd), paths));
  ipcMain.handle("git:unstage", async (_event, { cwd, paths }) => git.unstage(activeRepository(cwd), paths));
  ipcMain.handle("git:discard", async (_event, { cwd, paths }) => {
    activeRepository(cwd);
    const status = await git.status(cwd);
    const selected = status.entries.filter((entry) => paths.includes(entry.path));
    const hasUntracked = selected.some((entry) => entry.untracked);
    const names = selected.map((entry) => entry.path).join("\n");
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "warning", title: hasUntracked ? "Permanently delete untracked files?" : "Discard working changes?",
      message: hasUntracked ? "This permanently deletes the selected untracked file." : "This discards unstaged changes while preserving staged content.",
      detail: names, buttons: [hasUntracked ? "Delete permanently" : "Discard changes", "Cancel"], defaultId: 1, cancelId: 1, noLink: true,
    });
    if (response !== 0) return { cancelled: true, status };
    return { cancelled: false, status: await git.discard(cwd, paths) };
  });
  ipcMain.handle("git:commit", async (_event, { cwd, message }) => {
    activeRepository(cwd);
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "question", title: "Create Git commit?", message: "Commit the currently staged changes?", detail: message?.trim() || "No commit message",
      buttons: ["Create commit", "Cancel"], defaultId: 0, cancelId: 1, noLink: true,
    });
    if (response !== 0) return { cancelled: true };
    return { cancelled: false, ...(await git.commit(cwd, message)) };
  });

  ipcMain.handle("terminal:start", async (_event, { cwd, cols = 100, rows = 28 }) => {
    const activeClient = await ensureConnected();
    const processHandle = `terminal-${randomUUID()}`;
    const command = [process.env.SHELL || "/bin/bash", "-l"];
    await activeClient.request("process/spawn", { command, processHandle, cwd, tty: true, streamStdin: true, streamStdoutStderr: true, outputBytesCap: null, timeoutMs: null, size: { cols, rows } });
    return { processHandle, command: command[0] };
  });

  ipcMain.handle("terminal:write", async (_event, { processHandle, data }) => {
    const activeClient = await ensureConnected();
    return activeClient.request("process/writeStdin", { processHandle, deltaBase64: Buffer.from(data, "utf8").toString("base64"), closeStdin: false });
  });

  ipcMain.handle("terminal:resize", async (_event, { processHandle, cols, rows }) => {
    const activeClient = await ensureConnected();
    return activeClient.request("process/resizePty", { processHandle, size: { cols, rows } });
  });

  ipcMain.handle("terminal:kill", async (_event, processHandle) => {
    const activeClient = await ensureConnected();
    return activeClient.request("process/kill", { processHandle });
  });

  ipcMain.handle("companion:context", () => ({ thread: activeThreadContext, shortcut: shortcutAccelerator }));
  ipcMain.handle("companion:submit", async (_event, text) => {
    if (!text?.trim()) return { submitted: false };
    if (!activeThreadContext) {
      mainWindow.show(); mainWindow.focus(); sendEvent({ kind: "quickPrompt", text: text.trim() });
      return { submitted: false, needsProject: true };
    }
    const activeClient = await ensureConnected();
    await activeClient.request("turn/start", { threadId: activeThreadContext.id, input: [{ type: "text", text: text.trim(), text_elements: [] }] });
    companionWindow.hide(); mainWindow.show(); mainWindow.focus();
    return { submitted: true };
  });

  ipcMain.handle("desktop:openExternal", async (_event, rawUrl) => {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") throw new Error("Only HTTPS links can be opened");
    await shell.openExternal(url.toString());
  });

  ipcMain.handle("diagnostics:get", () => diagnosticsSnapshot());
  ipcMain.handle("diagnostics:copy", async () => {
    const bundle = { diagnostics: await diagnosticsSnapshot(), logs: logger?.recent(150) || [] };
    clipboard.writeText(JSON.stringify(bundle, null, 2));
    return true;
  });
  ipcMain.handle("diagnostics:export", async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export diagnostics",
      defaultPath: path.join(app.getPath("documents"), `codex-linux-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled) return null;
    const bundle = { diagnostics: await diagnosticsSnapshot(), logs: logger?.recent(250) || [] };
    fs.writeFileSync(result.filePath, `${JSON.stringify(bundle, null, 2)}\n`, { mode: 0o600 });
    log("info", "diagnostics.exported", { path: result.filePath });
    return result.filePath;
  });
  ipcMain.handle("diagnostics:showLog", () => { if (logger?.filePath) shell.showItemInFolder(logger.filePath); });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: "#171816",
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#171816", symbolColor: "#e7e9df", height: 44 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  mainWindow.on("close", (event) => {
    const preferences = desktopPreferences();
    if (shouldHideOnClose(preferences, { trayAvailable: Boolean(tray), isQuitting })) {
      event.preventDefault();
      mainWindow.hide();
      companionWindow?.hide();
      log("info", "desktop.hidden_to_tray");
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (!isQuitting) app.quit();
  });
  const captureArgument = process.argv.find((argument) => argument.startsWith("--capture-ui=") || argument.startsWith("--capture-diagnostics-ui=") || argument.startsWith("--capture-settings-ui="));
  if (captureArgument) mainWindow.webContents.once("did-finish-load", () => setTimeout(async () => {
    if (captureArgument.startsWith("--capture-diagnostics-ui=")) {
      await mainWindow.webContents.executeJavaScript("document.querySelector('#moreButton').click()");
      await new Promise((resolve) => setTimeout(resolve, 500));
    } else if (captureArgument.startsWith("--capture-settings-ui=")) {
      await mainWindow.webContents.executeJavaScript("document.querySelector('#accountButton').click()");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const image = await mainWindow.webContents.capturePage();
    fs.writeFileSync(captureArgument.slice(captureArgument.indexOf("=") + 1), image.toPNG());
    app.quit();
  }, 2500));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createCompanionWindow() {
  companionWindow = new BrowserWindow({
    width: 620, height: 190, minWidth: 460, minHeight: 170, show: false, frame: false, resizable: true,
    alwaysOnTop: true, skipTaskbar: true, backgroundColor: "#20211d",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  companionWindow.loadFile(path.join(__dirname, "../renderer/companion.html"));
  companionWindow.on("blur", () => companionWindow.hide());
}

function toggleCompanion() {
  if (!companionWindow) return;
  if (companionWindow.isVisible()) companionWindow.hide();
  else { companionWindow.center(); companionWindow.show(); companionWindow.focus(); companionWindow.webContents.send("companion:focus"); }
}

function registerQuickPromptShortcut(preferences = desktopPreferences()) {
  if (shortcutAccelerator) globalShortcut.unregister(shortcutAccelerator);
  shortcutRequested = preferences.quickPromptShortcut;
  shortcutRegistered = false;
  shortcutAccelerator = null;
  shortcutError = null;
  const candidates = shortcutCandidates(preferences);
  if (!candidates.length) return false;
  for (const accelerator of candidates) {
    try {
      if (globalShortcut.register(accelerator, toggleCompanion)) {
        shortcutRegistered = true;
        shortcutAccelerator = accelerator;
        return true;
      }
    } catch (error) {
      shortcutError = error.message;
    }
  }
  shortcutError ||= process.env.XDG_SESSION_TYPE === "wayland"
    ? "The desktop compositor did not grant this global shortcut. Configure a compositor shortcut or choose another key."
    : "The shortcut is already in use or is not supported by this desktop session.";
  return false;
}

function updateTray(preferences = desktopPreferences()) {
  if (!preferences.trayEnabled) {
    tray?.destroy();
    tray = null;
    trayError = null;
    return;
  }
  try {
    if (!tray) {
      tray = new Tray(nativeImage.createFromBuffer(createTrayIconPng(20)));
      tray.on("click", showMainWindow);
    }
    tray.setToolTip("Codex Linux Community");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Show Codex", click: showMainWindow },
      { label: "Quick prompt", accelerator: shortcutAccelerator || undefined, click: toggleCompanion },
      { type: "separator" },
      { label: "Quit", click: () => { isQuitting = true; app.quit(); } },
    ]));
    trayError = null;
  } catch (error) {
    tray?.destroy();
    tray = null;
    trayError = `Tray unavailable: ${error.message}`;
    log("warn", "desktop.tray_unavailable", { message: error.message, desktop: process.env.XDG_CURRENT_DESKTOP, sessionType: process.env.XDG_SESSION_TYPE });
  }
}

app.whenReady().then(() => {
  sessionMarkerPath = path.join(app.getPath("userData"), "running.lock");
  previousUncleanShutdown = fs.existsSync(sessionMarkerPath);
  fs.mkdirSync(path.dirname(sessionMarkerPath), { recursive: true });
  fs.writeFileSync(sessionMarkerPath, String(process.pid), { mode: 0o600 });
  logger = new StructuredLogger(path.join(app.getPath("userData"), "logs", "app.jsonl"));
  log("info", "app.started", { version: app.getVersion(), packaged: app.isPackaged, platform: process.platform, arch: process.arch, previousUncleanShutdown });
  registerIpc();
  createWindow();
  createCompanionWindow();
  registerQuickPromptShortcut();
  updateTray();
  log(shortcutRegistered || !shortcutRequested ? "info" : "warn", "quick_prompt.shortcut", shortcutSnapshot());
  if (!shortcutRegistered && shortcutRequested) sendEvent({ kind: "log", message: shortcutError });
  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("window-all-closed", () => {
  client?.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => { isQuitting = true; });
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  tray?.destroy();
  tray = null;
  if (sessionMarkerPath && !exitingAfterCrash) try { fs.rmSync(sessionMarkerPath, { force: true }); } catch {}
  log("info", "app.stopped");
});
app.on("render-process-gone", (_event, webContents, details) => {
  log("error", "electron.renderer_gone", { reason: details.reason, exitCode: details.exitCode, url: webContents.getURL() });
  dialog.showMessageBox({ type: "error", title: "Codex Linux stopped unexpectedly", message: `The interface stopped unexpectedly (${details.reason}).`, detail: "A redacted crash event was written to the diagnostics log.", buttons: ["Restart app", "Quit"], defaultId: 0 }).then(({ response }) => {
    if (response === 0) { exitingAfterCrash = true; app.relaunch(); app.exit(1); } else app.quit();
  });
});
app.on("child-process-gone", (_event, details) => log("error", "electron.child_process_gone", details));

process.on("uncaughtException", (error) => { exitingAfterCrash = true; log("error", "process.uncaught_exception", { message: error.message, stack: error.stack }); setImmediate(() => app.exit(1)); });
process.on("unhandledRejection", (reason) => log("error", "process.unhandled_rejection", { message: reason instanceof Error ? reason.message : String(reason), stack: reason instanceof Error ? reason.stack : null }));
