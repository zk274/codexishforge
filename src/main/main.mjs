import { app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, shell, Tray } from "electron";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import electronUpdater from "electron-updater";
import { XdgAutostart, resolveAutostartExecutable, resolveXdgConfigHome } from "./autostart.mjs";
import { chatGptLoginStartParams, logoutAccount, validateChatGptLoginResponse } from "./auth-protocol.mjs";
import { CodexClient } from "./codex-client.mjs";
import { CreationStore, searchWorkspace, validateRealtimeAudioChunk } from "./creation-service.mjs";
import { DEEP_LINK_SCHEME, extractDeepLinkArgument, parseDeepLink } from "./deep-links.mjs";
import { mergeDesktopPreferences, normalizeDesktopPreferences, shortcutCandidates, shouldHideOnClose } from "./desktop-preferences.mjs";
import {
  buildExtensionInventory,
  configFiles,
  configWriteTarget,
  isSafeExtensionId,
  resolveUserConfigPath,
} from "./extension-inventory.mjs";
import { resolveCodexCommand, validateCodexCommand } from "./codex-locator.mjs";
import { GitService } from "./git-service.mjs";
import { GitHubService } from "./github-service.mjs";
import { inspectCodexProtocol, unknownProtocolCompatibility } from "./protocol-compatibility.mjs";
import { repositoryPolicySnapshot } from "./repository-policy.mjs";
import { discoverReviewChecks, runReviewCheck } from "./review-service.mjs";
import { redactedDiagnosticsMarkdown, redactedTaskMarkdown } from "./share-summary.mjs";
import { StructuredLogger } from "./structured-logger.mjs";
import { TaskStore } from "./task-service.mjs";
import { createTrayIconPng } from "./tray-icon.mjs";
import { UpdateService, detectLinuxPackageType, normalizeUpdatePreferences } from "./update-service.mjs";
import {
  NOTIFICATION_DEDUPE_WINDOW_MS,
  notificationContent,
  notificationDedupeKey,
  shouldShowNotification,
} from "./notification-policy.mjs";
import { validateCropRectangle } from "../shared/capture-region.mjs";
import {
  cameraPermissionCheckAllowed,
  cameraPermissionRequestAllowed,
  validateCameraFrameDataUrl,
  validateCameraFrameSize,
} from "../shared/camera-capture.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { autoUpdater } = electronUpdater;
const initialDeepLinkArgument = extractDeepLinkArgument(process.argv);
const singleInstanceLockAcquired = app.requestSingleInstanceLock({ deepLink: initialDeepLinkArgument });
if (!singleInstanceLockAcquired) app.quit();
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
let autostart = null;
let updateService = null;
let updateCheckTimer = null;
let updateCheckInterval = null;
let taskStore = null;
let creationStore = null;
let taskPumpRunning = false;
let taskPumpScheduled = false;
let taskRecoveryAttempted = false;
let deepLinkRendererReady = false;
const pendingDeepLinkActions = [];
const deepLinkState = {
  handled: 0,
  rejected: 0,
  cancelled: 0,
  lastKind: null,
  lastSource: null,
  lastError: null,
};
let notificationIcon = null;
const notificationDedupe = new Map();
const liveNotifications = new Set();
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
const github = new GitHubService();
const reviewEvidence = new Map();
const githubContextCache = new Map();
const realtimeSessions = new Map();

function taskStoragePath() {
  return path.join(app.getPath("userData"), "tasks.json");
}

function creationStoragePath() {
  return path.join(app.getPath("userData"), "creation.json");
}

function creationSnapshot() {
  return creationStore?.snapshot() || { templates: [], artifacts: [] };
}

function initializeCreation() {
  creationStore = new CreationStore(creationStoragePath(), {
    onChange: (creation) => sendEvent({ kind: "creationState", creation }),
  });
  log("info", "creation.initialized", { templates: creationStore.templates.length, artifacts: creationStore.artifacts.length });
}

function taskWorktreeRoot() {
  return path.join(app.getPath("userData"), "worktrees");
}

function taskSnapshot() {
  return taskStore?.snapshot() || {
    tasks: [],
    inbox: [],
    limits: { maxConcurrent: 2, active: 0, queued: 0 },
    counts: {},
    unread: 0,
  };
}

function initializeTasks() {
  taskStore = new TaskStore(taskStoragePath(), {
    maxConcurrent: 2,
    onChange: (tasks) => sendEvent({ kind: "tasksState", tasks }),
  });
  const recovered = taskStore.recoverInterrupted();
  log(recovered.length ? "warn" : "info", "tasks.initialized", { tasks: taskStore.tasks.length, recovered: recovered.length });
}

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

function updatePreferences() {
  return normalizeUpdatePreferences(readSettings().updates);
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

function notificationSnapshot() {
  try { return { supported: Notification.isSupported(), active: liveNotifications.size }; }
  catch (error) { return { supported: false, active: liveNotifications.size, error: error.message }; }
}

function autostartSnapshot() {
  if (autostart) return autostart.status();
  return {
    available: false,
    enabled: false,
    managed: false,
    conflict: false,
    stale: false,
    testMode: false,
    filePath: null,
    executable: null,
    reason: "Launch at login has not been initialized.",
  };
}

function deepLinkSnapshot() {
  return {
    scheme: DEEP_LINK_SCHEME,
    singleInstance: singleInstanceLockAcquired,
    registeredByPackage: app.isPackaged,
    rendererReady: deepLinkRendererReady,
    pending: pendingDeepLinkActions.length,
    ...deepLinkState,
  };
}

function updateSnapshot() {
  if (updateService) return updateService.snapshot();
  return {
    currentVersion: app.getVersion(),
    packageType: app.isPackaged ? "unknown" : "development",
    supported: false,
    preferences: updatePreferences(),
    phase: "unavailable",
    availableVersion: null,
    checkedAt: null,
    percent: null,
    transferred: null,
    total: null,
    error: null,
    reason: "The updater has not been initialized.",
    canCheck: false,
    canDownload: false,
    canInstall: false,
  };
}

function desktopState() {
  return {
    preferences: desktopPreferences(),
    shortcut: shortcutSnapshot(),
    tray: traySnapshot(),
    autostart: autostartSnapshot(),
    deepLinks: deepLinkSnapshot(),
    notifications: notificationSnapshot(),
    environment: {
      desktop: process.env.XDG_CURRENT_DESKTOP || null,
      sessionType: process.env.XDG_SESSION_TYPE || null,
    },
  };
}

function appWindowFocused() {
  return Boolean(mainWindow?.isFocused() || companionWindow?.isFocused());
}

function activateDesktopNotification(target) {
  showMainWindow();
  setTimeout(() => sendEvent({ kind: "notificationActivated", target }), 75);
}

function showDesktopNotification(kind, { id, requestType = null, exitCode = null, failedToStart = false, target = null, ignoreFocus = false } = {}) {
  const supported = notificationSnapshot().supported;
  const key = notificationDedupeKey(kind, id);
  const now = Date.now();
  const duplicate = now - (notificationDedupe.get(key) || 0) < NOTIFICATION_DEDUPE_WINDOW_MS;
  const decision = shouldShowNotification({
    kind,
    preferences: desktopPreferences(),
    supported,
    focused: !ignoreFocus && appWindowFocused(),
    duplicate,
  });
  if (!decision.show) return { shown: false, reason: decision.reason };

  for (const [candidate, shownAt] of notificationDedupe) {
    if (now - shownAt > NOTIFICATION_DEDUPE_WINDOW_MS) notificationDedupe.delete(candidate);
  }
  const content = notificationContent(kind, { requestType, exitCode, failedToStart });
  notificationIcon ||= nativeImage.createFromBuffer(createTrayIconPng(64));
  const notification = new Notification({
    ...content,
    icon: notificationIcon,
    timeoutType: "default",
  });
  let cleanupTimer = null;
  const cleanup = () => {
    liveNotifications.delete(notification);
    if (cleanupTimer) clearTimeout(cleanupTimer);
    cleanupTimer = null;
  };
  notification.on("click", () => {
    cleanup();
    activateDesktopNotification(target || { kind });
  });
  notification.on("close", cleanup);
  notification.on("failed", (_event, error) => {
    cleanup();
    log("warn", "desktop.notification_failed", { kind, message: error?.message || String(error || "Unknown notification error") });
  });
  liveNotifications.add(notification);
  notificationDedupe.set(key, now);
  cleanupTimer = setTimeout(cleanup, 5 * 60_000);
  cleanupTimer.unref();
  try { notification.show(); }
  catch (error) {
    cleanup();
    log("warn", "desktop.notification_failed", { kind, message: error.message });
    return { shown: false, reason: "failed" };
  }
  log("info", "desktop.notification_shown", { kind });
  return { shown: true, reason: null };
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

async function reviewRepository(cwd) {
  if (!activeThreadContext?.cwd) throw new Error("Open a Codex thread before reviewing Git state");
  const [activeRoot, candidateRoot] = await Promise.all([
    git.repositoryRoot(activeThreadContext.cwd),
    git.repositoryRoot(cwd),
  ]);
  if (fs.realpathSync(activeRoot) !== fs.realpathSync(candidateRoot)) throw new Error("Review actions are limited to the active thread's repository");
  return activeRoot;
}

function bindClientEvents(activeClient) {
  activeClient.on("notification", (message) => {
    if (message.method === "thread/name/updated" && activeThreadContext?.id === message.params.threadId) activeThreadContext.title = message.params.name || activeThreadContext.title;
    handleTaskNotification(message);
    if (["thread/realtime/transcript/delta", "thread/realtime/transcript/done"].includes(message.method)) {
      const text = String(message.params?.delta || message.params?.text || "").slice(0, 20_000);
      sendEvent({ kind: "realtimeTranscript", phase: message.method.endsWith("/done") ? "done" : "delta", threadId: message.params?.threadId || null, role: String(message.params?.role || ""), text });
      return;
    }
    if (message.method === "thread/realtime/outputAudio/delta") {
      try {
        const audio = validateRealtimeAudioChunk(message.params?.audio);
        sendEvent({ kind: "realtimeAudio", threadId: message.params?.threadId || null, audio });
      } catch (error) { log("warn", "realtime.audio_rejected", { message: error.message }); }
      return;
    }
    if (["thread/realtime/started", "thread/realtime/error", "thread/realtime/closed"].includes(message.method)) {
      const threadId = message.params?.threadId || null;
      if (message.method.endsWith("/closed")) realtimeSessions.delete(threadId);
      sendEvent({
        kind: "realtimeState",
        phase: message.method.split("/").at(-1),
        threadId,
        error: message.method.endsWith("/error") ? String(message.params?.message || message.params?.error || "Realtime voice stopped").slice(0, 500) : null,
      });
      return;
    }
    sendEvent({ kind: "notification", ...message });
    if (message.method === "turn/completed") {
      const turnId = message.params.turn?.id;
      const threadId = message.params.threadId || activeThreadContext?.id || null;
      if (turnId) showDesktopNotification("turn", { id: turnId, target: { kind: "thread", threadId } });
    }
  });
  activeClient.on("serverRequest", (message) => {
    if (message.method === "currentTime/read") activeClient.respond(message.id, { currentTimeAt: Math.floor(Date.now() / 1000) });
    else {
      const backgroundTask = taskStore?.taskForThread(message.params?.threadId);
      if (backgroundTask) {
        const input = ["item/tool/requestUserInput", "mcpServer/elicitation/request"].includes(message.method);
        taskStore.waiting(backgroundTask.id, String(message.id), input ? "question" : "approval");
      }
      sendEvent({ kind: "request", ...message });
      const requestType = ["item/tool/requestUserInput", "mcpServer/elicitation/request"].includes(message.method) ? "input" : "approval";
      showDesktopNotification("request", {
        id: message.id,
        requestType,
        target: { kind: "request", requestId: message.id, threadId: message.params?.threadId || activeThreadContext?.id || null },
      });
    }
  });
  activeClient.on("status", (status) => {
    if (!status.connected && taskStore) {
      taskRecoveryAttempted = false;
      taskStore.recoverInterrupted();
    }
    log(status.connected ? "info" : "error", "codex.status", status);
    sendEvent({ kind: "status", ...status });
  });
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
  client = new CodexClient({ command: discovery.command, clientVersion: app.getVersion() });
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
  if (!taskRecoveryAttempted && taskStore) await recoverBackgroundTasks(activeClient);
  return activeClient;
}

function taskDirectoryName(task) {
  const repository = path.basename(task.repository).replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60) || "repository";
  return `${repository}-${task.id.slice(0, 12)}`;
}

async function prepareTaskDirectory(task) {
  if (task.isolation !== "worktree") {
    const repository = await git.repositoryRoot(task.repository);
    taskStore.prepare(task.id, { cwd: repository });
    return repository;
  }
  if (task.worktreePath && fs.existsSync(task.worktreePath)) {
    taskStore.prepare(task.id, { cwd: task.worktreePath, worktreePath: task.worktreePath });
    return task.worktreePath;
  }
  const root = taskWorktreeRoot();
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const destination = path.join(root, taskDirectoryName(task));
  taskStore.prepare(task.id, { cwd: destination, worktreePath: destination });
  const result = await git.createDetachedWorktree(task.repository, destination, {
    ref: task.baseRef || "HEAD",
    allowedRoot: root,
  });
  log("info", "tasks.worktree_created", { taskId: task.id, repository: result.repository, path: result.path, commit: result.commit });
  return result.path;
}

async function startBackgroundTask(task) {
  try {
    const cwd = await prepareTaskDirectory(task);
    if (taskStore.find(task.id)?.state === "cancelled") return;
    const activeClient = await ensureConnected();
    const response = await activeClient.request("thread/start", {
      cwd,
      model: task.model || null,
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
      serviceName: "codex_linux_community_background",
      sessionStartSource: "startup",
      threadSource: "codex-linux-community",
    });
    const threadId = response.thread.id;
    taskStore.running(task.id, { threadId });
    if (taskStore.find(task.id)?.state === "cancelled") return;
    const turn = await activeClient.request("turn/start", {
      threadId,
      input: [{ type: "text", text: task.prompt, text_elements: [] }],
      model: task.model || null,
      effort: task.effort || null,
    });
    taskStore.update(task.id, { turnId: turn.turn?.id || null }, { kind: "turn", message: "The background turn is running." });
    log("info", "tasks.started", { taskId: task.id, threadId, turnId: turn.turn?.id || null, isolation: task.isolation });
  } catch (error) {
    if (taskStore.find(task.id)?.state !== "recovering") taskStore.fail(task.id, error);
    log("error", "tasks.start_failed", { taskId: task.id, message: error.message });
  }
}

function scheduleTaskPump() {
  if (taskPumpScheduled) return;
  taskPumpScheduled = true;
  setImmediate(async () => {
    taskPumpScheduled = false;
    if (taskPumpRunning || !taskStore) return;
    taskPumpRunning = true;
    try {
      while (true) {
        const task = taskStore.nextQueued();
        if (!task) break;
        await startBackgroundTask(task);
      }
    } finally {
      taskPumpRunning = false;
    }
  });
}

async function recoverBackgroundTasks(activeClient) {
  if (taskRecoveryAttempted || !taskStore) return;
  taskRecoveryAttempted = true;
  const recovering = taskStore.tasks.filter((task) => task.state === "recovering");
  for (const task of recovering) {
    try {
      const response = await activeClient.request("thread/resume", { threadId: task.threadId });
      const turn = response.thread?.turns?.at(-1) || null;
      if (!turn) {
        taskStore.fail(task.id, "The saved Codex thread had no turn to recover.");
      } else if (turn.status === "inProgress") {
        taskStore.running(task.id, { threadId: response.thread.id, turnId: turn.id });
        taskStore.update(task.id, {}, { kind: "recovered", message: "Recovered the running task after restart." });
      } else {
        taskStore.finish(task.id, turn);
      }
    } catch (error) {
      taskStore.fail(task.id, `The saved Codex thread could not be recovered: ${error.message}`);
    }
  }
  scheduleTaskPump();
}

function handleTaskNotification(message) {
  if (!taskStore) return;
  const params = message.params || {};
  if (message.method === "thread/started" && params.thread?.parentThreadId) taskStore.observeAgentThread(params.thread);
  if (message.method === "thread/status/changed" && taskStore.taskForAgentThread(params.threadId)) {
    taskStore.observeAgentStatus(params.threadId, params.status);
    return;
  }
  const task = taskStore.taskForThread(params.threadId);
  if (!task) return;
  if (message.method === "thread/status/changed") taskStore.observeThreadStatus(params.threadId, params.status);
  else if (message.method === "turn/started") {
    taskStore.update(task.id, { state: "running", turnId: params.turn?.id || task.turnId }, { kind: "running", message: "The Codex turn started." });
  } else if (message.method === "turn/completed") {
    taskStore.finish(task.id, params.turn);
    scheduleTaskPump();
  } else if (["item/started", "item/completed"].includes(message.method)) {
    taskStore.observeItem(params.threadId, params.item);
  }
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
  await recoverBackgroundTasks(activeClient);
  log("info", "codex.bootstrap_complete", { threads: threads.data.length, models: models.data.length, authenticated: Boolean(account.account) });
  return { threads: threads.data, models: models.data, account, cli: cliStatus(), compatibility, desktop: desktopState(), updates: updateSnapshot(), tasks: taskSnapshot(), creation: creationSnapshot(), lastThreadId: readSettings().lastThreadId || null };
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
    autostart: autostartSnapshot(),
    deepLinks: deepLinkSnapshot(),
    updates: updateSnapshot(),
    notifications: notificationSnapshot(),
    tasks: {
      counts: taskSnapshot().counts,
      limits: taskSnapshot().limits,
      unread: taskSnapshot().unread,
      storage: taskStore?.filePath || null,
      worktreeRoot: taskWorktreeRoot(),
    },
    creation: {
      artifacts: creationSnapshot().artifacts.length,
      customTemplates: creationSnapshot().templates.filter((template) => !template.builtin).length,
      storage: creationStore?.filePath || null,
      realtimeVoice: Boolean(compatibility.features?.realtimeVoice?.available),
    },
    activeThread: activeThreadContext ? { id: activeThreadContext.id, project: path.basename(activeThreadContext.cwd), title: activeThreadContext.title } : null,
    logFile: logger?.filePath || null,
  };
}

function evidenceFor(cwd) {
  return reviewEvidence.get(cwd) || [];
}

async function githubContextFor(cwd, { force = false } = {}) {
  const cached = githubContextCache.get(cwd);
  if (!force && cached && Date.now() - cached.at < 60_000) return cached.value;
  const value = await github.context(cwd);
  githubContextCache.set(cwd, { at: Date.now(), value });
  return value;
}

async function reviewCenterSnapshot(cwd, { forceGitHub = false } = {}) {
  const repository = await reviewRepository(cwd);
  const [review, githubContext, hooksPath] = await Promise.all([
    git.review(repository, { evidence: evidenceFor(repository) }),
    githubContextFor(repository, { force: forceGitHub }),
    git.hooksPath(repository),
  ]);
  return {
    review,
    checks: discoverReviewChecks(repository),
    github: githubContext,
    policy: repositoryPolicySnapshot(repository, { hooksPath, remote: githubContext.protection }),
  };
}

function extensionCwd() {
  return activeThreadContext?.cwd || app.getPath("home");
}

function extensionFeatureAvailable(name) {
  return compatibility?.features?.[name]?.available !== false;
}

async function listMcpServers(activeClient) {
  const data = [];
  let cursor = null;
  for (let page = 0; page < 20; page += 1) {
    const response = await activeClient.request("mcpServerStatus/list", {
      cursor,
      detail: "toolsAndAuthOnly",
      limit: 100,
    });
    data.push(...(response.data || []));
    cursor = response.nextCursor || null;
    if (!cursor) return { data, nextCursor: null };
  }
  throw new Error("MCP server inventory exceeded the supported pagination limit");
}

async function extensionSnapshot({ forceReload = false } = {}) {
  const activeClient = await ensureConnected();
  const cwd = extensionCwd();
  const tasks = {
    config: extensionFeatureAvailable("configInventory")
      ? activeClient.request("config/read", { cwd, includeLayers: true })
      : Promise.resolve(null),
    skills: extensionFeatureAvailable("skillInventory")
      ? activeClient.request("skills/list", { cwds: [cwd], forceReload: forceReload === true })
      : Promise.resolve(null),
    plugins: extensionFeatureAvailable("pluginInventory")
      ? activeClient.request("plugin/installed", { cwds: [cwd] })
      : Promise.resolve(null),
    mcp: extensionFeatureAvailable("mcpInventory")
      ? listMcpServers(activeClient)
      : Promise.resolve(null),
  };
  const names = Object.keys(tasks);
  const results = await Promise.allSettled(Object.values(tasks));
  const settled = Object.fromEntries(names.map((name, index) => [name, results[index]]));
  const value = (name) => settled[name].status === "fulfilled" ? settled[name].value : null;
  const error = (name) => settled[name].status === "rejected" ? settled[name].reason : null;
  const snapshot = buildExtensionInventory({
    cwd,
    compatibility,
    configResponse: value("config"),
    configError: error("config"),
    skillsResponse: value("skills"),
    skillsError: error("skills"),
    pluginsResponse: value("plugins"),
    pluginsError: error("plugins"),
    mcpResponse: value("mcp"),
    mcpError: error("mcp"),
    fallbackUserConfig: resolveUserConfigPath(),
  });
  log(snapshot.summary.issues ? "warn" : "info", "extensions.inventory", snapshot.summary);
  return snapshot;
}

async function setExtensionEnabled({ kind, id, enabled } = {}) {
  if (!["skill", "plugin", "mcp"].includes(kind)) throw new TypeError("Unsupported extension type");
  if (typeof enabled !== "boolean") throw new TypeError("Extension state must be enabled or disabled");
  const activeClient = await ensureConnected();
  const cwd = extensionCwd();

  if (kind === "skill") {
    if (!extensionFeatureAvailable("skillManagement")) throw new Error("This Codex CLI cannot change skill settings");
    if (typeof id !== "string" || !path.isAbsolute(id)) throw new TypeError("Skill path is invalid");
    const response = await activeClient.request("skills/list", { cwds: [cwd], forceReload: true });
    const skill = (response.data || []).flatMap((entry) => entry.skills || []).find((entry) => entry.path === id);
    if (!skill) throw new Error("That skill is no longer installed");
    await activeClient.request("skills/config/write", { path: skill.path, enabled });
  } else {
    if (!extensionFeatureAvailable("configManagement")) throw new Error("This Codex CLI cannot safely update configuration");
    if (!isSafeExtensionId(id)) throw new TypeError(`${kind === "plugin" ? "Plugin" : "MCP server"} identifier is not safe to edit`);
    const config = await activeClient.request("config/read", { cwd, includeLayers: true });
    let keyPath;
    if (kind === "plugin") {
      if (!extensionFeatureAvailable("pluginInventory")) throw new Error("Installed plugin inventory is unavailable");
      const plugins = await activeClient.request("plugin/installed", { cwds: [cwd] });
      const plugin = (plugins.marketplaces || []).flatMap((entry) => entry.plugins || []).find((entry) => entry.id === id && entry.installed !== false);
      if (!plugin) throw new Error("That plugin is no longer installed");
      if (plugin.availability === "DISABLED_BY_ADMIN") throw new Error("That plugin is controlled by your workspace administrator");
      keyPath = `plugins.${id}.enabled`;
    } else {
      const configured = config.config?.mcp_servers;
      if (!configured || typeof configured !== "object" || !Object.hasOwn(configured, id)) {
        throw new Error("Only explicitly configured MCP servers can be changed here");
      }
      keyPath = `mcp_servers.${id}.enabled`;
    }
    const target = configWriteTarget(config, keyPath, { fallbackUserConfig: resolveUserConfigPath() });
    if (!target.editable || !target.path) throw new Error("This extension is controlled by a read-only Codex configuration layer");
    await activeClient.request("config/batchWrite", {
      edits: [{ keyPath, value: enabled, mergeStrategy: "upsert" }],
      expectedVersion: target.version,
      filePath: target.path,
      reloadUserConfig: true,
    });
    if (kind === "mcp" && extensionFeatureAvailable("mcpManagement")) {
      await activeClient.request("config/mcpServer/reload", {});
    }
  }

  log("info", "extensions.enabled_changed", { kind, id, enabled });
  return extensionSnapshot({ forceReload: true });
}

async function showCodexConfig(filePath) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) throw new TypeError("Configuration path is invalid");
  const activeClient = await ensureConnected();
  const config = await activeClient.request("config/read", { cwd: extensionCwd(), includeLayers: true });
  const allowed = configFiles(config, { fallbackUserConfig: resolveUserConfigPath() });
  const target = allowed.find((entry) => entry.path === path.normalize(filePath));
  if (!target) throw new Error("That path is not an active Codex configuration file");
  if (target.exists) shell.showItemInFolder(target.path);
  else {
    const result = await shell.openPath(path.dirname(target.path));
    if (result) throw new Error(result);
  }
  return target.path;
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

  ipcMain.handle("codex:showHome", () => {
    rememberThread(null);
    log("info", "navigation.home");
    return true;
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
    taskStore?.resolveRequest(String(id));
    return true;
  });

  ipcMain.handle("codex:rejectRequest", (_event, { id, message }) => {
    getClient()?.reject(id, -32000, message || "Request was not supported by this client");
    taskStore?.resolveRequest(String(id));
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
    const login = validateChatGptLoginResponse(await activeClient.request("account/login/start", chatGptLoginStartParams()));
    await shell.openExternal(login.authUrl);
    return { loginId: login.loginId };
  });

  ipcMain.handle("codex:readAccount", async () => {
    const activeClient = await ensureConnected();
    return activeClient.request("account/read", { refreshToken: true });
  });

  ipcMain.handle("codex:logout", async () => {
    const activeClient = await ensureConnected();
    return logoutAccount(activeClient);
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
    return sources.map((source) => {
      const size = source.thumbnail.getSize();
      return {
        id: source.id,
        name: source.name,
        kind: source.id.startsWith("screen:") ? "screen" : "window",
        displayId: source.display_id || null,
        width: size.width,
        height: size.height,
        thumbnail: source.thumbnail.toDataURL(),
        icon: source.appIcon?.toDataURL() || null,
        wayland: process.env.XDG_SESSION_TYPE?.toLowerCase() === "wayland",
      };
    });
  });

  ipcMain.handle("desktop:captureSource", (_event, sourceId) => {
    const source = captureSources.get(sourceId);
    if (!source) throw new Error("That screenshot source is no longer available");
    captureSources.clear();
    return saveImage(source.thumbnail, "screenshot");
  });

  ipcMain.handle("desktop:captureSourceRegion", (_event, { sourceId, rect } = {}) => {
    const source = captureSources.get(sourceId);
    if (!source) throw new Error("That screenshot source is no longer available");
    const crop = validateCropRectangle(rect, source.thumbnail.getSize(), { minimum: 4 });
    const image = source.thumbnail.crop(crop);
    captureSources.clear();
    return saveImage(image, "region");
  });

  ipcMain.handle("desktop:saveCameraFrame", (_event, dataUrl) => {
    const image = nativeImage.createFromDataURL(validateCameraFrameDataUrl(dataUrl));
    if (image.isEmpty()) throw new Error("The camera did not provide a usable image");
    validateCameraFrameSize(image.getSize());
    return saveImage(image, "camera");
  });

  ipcMain.handle("desktop:notifyTerminal", (event, payload = {}) => {
    if (event.sender !== mainWindow?.webContents) throw new Error("Terminal notifications are limited to the main window");
    const processHandle = payload.processHandle;
    const terminalId = payload.terminalId;
    if (typeof processHandle !== "string" || processHandle.length < 1 || processHandle.length > 200) throw new TypeError("Terminal process handle is invalid");
    if (typeof terminalId !== "string" || terminalId.length < 1 || terminalId.length > 200) throw new TypeError("Terminal tab id is invalid");
    if (payload.exitCode != null && !Number.isInteger(payload.exitCode)) throw new TypeError("Terminal exit code is invalid");
    const notification = showDesktopNotification("terminal", {
      id: processHandle,
      exitCode: payload.exitCode ?? null,
      failedToStart: payload.failedToStart === true,
      target: { kind: "terminal", processHandle, terminalId },
    });
    if (payload.failedToStart === true || (Number.isInteger(payload.exitCode) && payload.exitCode !== 0)) {
      taskStore?.addInbox({
        kind: "terminal",
        title: payload.failedToStart === true ? "Background terminal failed to start" : `Background terminal exited with code ${payload.exitCode}`,
        detail: "Open the project terminal to inspect its output.",
      });
    }
    return notification;
  });

  ipcMain.handle("desktop:getPreferences", () => desktopState());
  ipcMain.handle("tasks:get", () => taskSnapshot());
  ipcMain.handle("tasks:create", async (_event, payload = {}) => {
    const repository = await git.repositoryRoot(payload.repository);
    const task = taskStore.create({ ...payload, repository });
    log("info", "tasks.queued", { taskId: task.id, repository, isolation: task.isolation });
    scheduleTaskPump();
    return taskSnapshot();
  });
  ipcMain.handle("tasks:cancel", async (_event, taskId) => {
    const task = taskStore.find(taskId);
    if (!task) throw new Error("Task was not found");
    if (task.threadId && task.turnId && ["running", "waiting", "recovering"].includes(task.state)) {
      const activeClient = await ensureConnected();
      await activeClient.request("turn/interrupt", { threadId: task.threadId, turnId: task.turnId });
    }
    taskStore.cancel(taskId);
    scheduleTaskPump();
    return taskSnapshot();
  });
  ipcMain.handle("tasks:retry", (_event, taskId) => {
    taskStore.retry(taskId);
    scheduleTaskPump();
    return taskSnapshot();
  });
  ipcMain.handle("tasks:dismissInbox", (_event, inboxId) => {
    taskStore.dismissInbox(inboxId);
    return taskSnapshot();
  });
  ipcMain.handle("tasks:showWorktree", async (_event, taskId) => {
    const task = taskStore.find(taskId);
    if (!task) throw new Error("Task was not found");
    const target = task.worktreePath || task.cwd;
    if (!target || !path.isAbsolute(target) || !fs.existsSync(target)) throw new Error("The task worktree is unavailable");
    const realTarget = fs.realpathSync(target);
    const realWorktreeRoot = task.worktreePath && fs.existsSync(taskWorktreeRoot()) ? fs.realpathSync(taskWorktreeRoot()) : null;
    const worktreeRelative = realWorktreeRoot ? path.relative(realWorktreeRoot, realTarget) : null;
    const allowedWorktree = Boolean(task.worktreePath && worktreeRelative && worktreeRelative !== ".." && !worktreeRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(worktreeRelative));
    const allowedRepository = realTarget === fs.realpathSync(task.repository);
    if (!allowedWorktree && !allowedRepository) throw new Error("The task directory is outside its managed location");
    const result = await shell.openPath(realTarget);
    if (result) throw new Error(result);
    return realTarget;
  });
  ipcMain.handle("creation:get", () => creationSnapshot());
  ipcMain.handle("creation:saveTemplate", (_event, payload = {}) => {
    creationStore.saveTemplate(payload);
    return creationSnapshot();
  });
  ipcMain.handle("creation:deleteTemplate", async (_event, templateId) => {
    const template = creationSnapshot().templates.find((entry) => entry.id === templateId && !entry.builtin);
    if (!template) throw new Error("Custom task template was not found");
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "Delete task template?",
      message: `Delete “${template.name}”?`,
      detail: "This removes the reusable template from this device.",
      buttons: ["Cancel", "Delete template"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (confirmation.response !== 1) return { cancelled: true, creation: creationSnapshot() };
    return { cancelled: false, creation: creationStore.deleteTemplate(templateId) };
  });
  ipcMain.handle("creation:saveArtifact", (_event, payload = {}) => {
    creationStore.saveArtifact(payload);
    return creationSnapshot();
  });
  ipcMain.handle("creation:deleteArtifact", async (_event, artifactId) => {
    const artifact = creationStore.artifact(artifactId);
    if (!artifact) throw new Error("Artifact was not found");
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "Delete artifact?",
      message: `Delete “${artifact.title}”?`,
      detail: "This removes the local Canvas artifact from this device.",
      buttons: ["Cancel", "Delete artifact"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (confirmation.response !== 1) return { cancelled: true, creation: creationSnapshot() };
    return { cancelled: false, creation: creationStore.deleteArtifact(artifactId) };
  });
  ipcMain.handle("creation:exportArtifact", async (_event, artifactId) => {
    const artifact = creationStore.artifact(artifactId);
    if (!artifact) throw new Error("Artifact was not found");
    const safeName = artifact.title.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "artifact";
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export Canvas artifact",
      defaultPath: path.join(artifact.repository || app.getPath("documents"), `${safeName}.md`),
      filters: [{ name: "Markdown", extensions: ["md"] }, { name: "Text", extensions: ["txt"] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, artifact.body, { mode: 0o600 });
    return result.filePath;
  });
  ipcMain.handle("creation:attachArtifact", (_event, artifactId) => {
    const artifact = creationStore.artifact(artifactId);
    if (!artifact) throw new Error("Artifact was not found");
    const safeName = artifact.title.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "artifact";
    const filePath = path.join(attachmentDirectory(), `${safeName}-${randomUUID()}.md`);
    fs.writeFileSync(filePath, artifact.body, { mode: 0o600, flag: "wx" });
    return attachmentInfo(filePath);
  });
  ipcMain.handle("creation:search", async (_event, { query, repository = null } = {}) => {
    const cleanQuery = typeof query === "string" ? query.trim().slice(0, 200) : "";
    if (cleanQuery.length < 2) throw new Error("Enter at least two search characters");
    if (repository && (!activeThreadContext?.cwd || !path.isAbsolute(repository) || fs.realpathSync(repository) !== fs.realpathSync(activeThreadContext.cwd))) throw new Error("Search is limited to the active repository");
    const root = activeThreadContext?.cwd || null;
    let threads = [];
    let activeClient = client?.ready ? client : null;
    if (!activeClient) {
      try {
        activeClient = await ensureConnected();
      } catch (error) {
        log("warn", "creation.thread_search_unavailable", { message: error.message });
      }
    }
    if (activeClient) {
      if (compatibility.features?.threadSearch?.available) {
        try {
          const response = await activeClient.request("thread/search", { searchTerm: cleanQuery, limit: 50, sortKey: "updated_at", sortDirection: "desc" });
          threads = (response.data || []).map((entry) => ({ ...entry.thread, preview: entry.snippet || entry.thread?.preview }));
        } catch (error) {
          log("warn", "creation.thread_search_fallback", { message: error.message });
        }
      }
      if (!threads.length) {
        try {
          const response = await activeClient.request("thread/list", { limit: 100, sortKey: "updated_at", sortDirection: "desc" });
          threads = response.data || [];
        } catch (error) {
          log("warn", "creation.thread_list_unavailable", { message: error.message });
        }
      }
    }
    return searchWorkspace({
      query: cleanQuery,
      threads,
      tasks: taskSnapshot().tasks,
      artifacts: creationSnapshot().artifacts,
      repository: root,
    });
  });
  ipcMain.handle("creation:showFile", async (_event, { repository, relativePath } = {}) => {
    if (!activeThreadContext?.cwd || !path.isAbsolute(repository) || fs.realpathSync(repository) !== fs.realpathSync(activeThreadContext.cwd)) throw new Error("Search results are limited to the active repository");
    if (typeof relativePath !== "string" || path.isAbsolute(relativePath) || relativePath.includes("\0")) throw new Error("Search result path is invalid");
    const candidate = fs.realpathSync(path.join(repository, relativePath));
    const root = fs.realpathSync(repository);
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new Error("Search result is outside the active repository");
    shell.showItemInFolder(candidate);
    return true;
  });
  ipcMain.handle("voice:get", async () => {
    if (!compatibility.features?.realtimeVoice?.available) return { available: false, reason: "Update Codex to a version that advertises the realtime voice protocol." };
    try {
      const activeClient = await ensureConnected();
      const response = await activeClient.request("thread/realtime/listVoices", {});
      const voices = [...new Set([...(response.voices?.v2 || []), ...(response.voices?.v1 || [])])].slice(0, 30);
      return { available: true, voices, defaultVoice: response.voices?.defaultV2 || response.voices?.defaultV1 || voices[0] || null, experimental: true };
    } catch (error) {
      return { available: false, reason: String(error.message || "Realtime voice is unavailable").slice(0, 500), experimental: true };
    }
  });
  ipcMain.handle("voice:start", async (_event, { threadId, mode = "dictation", voice = null } = {}) => {
    if (!compatibility.features?.realtimeVoice?.available) throw new Error("This Codex CLI does not advertise realtime voice");
    if (!activeThreadContext || threadId !== activeThreadContext.id) throw new Error("Voice is limited to the active Codex thread");
    if (!["dictation", "conversation"].includes(mode)) throw new Error("Voice mode is invalid");
    if (voice !== null && !/^[a-z]{2,24}$/.test(voice)) throw new Error("Voice selection is invalid");
    const activeClient = await ensureConnected();
    if (realtimeSessions.has(threadId)) await activeClient.request("thread/realtime/stop", { threadId }).catch(() => {});
    await activeClient.request("thread/realtime/start", {
      threadId,
      outputModality: mode === "conversation" ? "audio" : "text",
      voice: mode === "conversation" ? voice : null,
      clientManagedHandoffs: mode === "dictation",
      flushTranscriptTailOnSessionEnd: false,
      prompt: mode === "dictation"
        ? "Transcribe the user's speech faithfully as prompt text. Do not answer, execute, or hand work to Codex."
        : null,
    });
    realtimeSessions.set(threadId, { mode, startedAt: Date.now() });
    return { active: true, mode };
  });
  ipcMain.handle("voice:appendAudio", async (_event, { threadId, audio } = {}) => {
    if (!activeThreadContext || threadId !== activeThreadContext.id || !realtimeSessions.has(threadId)) throw new Error("No realtime voice session is active for this thread");
    const activeClient = await ensureConnected();
    await activeClient.request("thread/realtime/appendAudio", { threadId, audio: validateRealtimeAudioChunk(audio) });
    return true;
  });
  ipcMain.handle("voice:stop", async (_event, threadId) => {
    if (!activeThreadContext || threadId !== activeThreadContext.id) throw new Error("Voice is limited to the active Codex thread");
    const activeClient = await ensureConnected();
    if (realtimeSessions.has(threadId)) await activeClient.request("thread/realtime/stop", { threadId });
    realtimeSessions.delete(threadId);
    return { active: false };
  });
  ipcMain.handle("extensions:get", (_event, options = {}) => extensionSnapshot({ forceReload: options?.forceReload === true }));
  ipcMain.handle("extensions:setEnabled", (_event, payload) => setExtensionEnabled(payload));
  ipcMain.handle("extensions:showConfig", (_event, filePath) => showCodexConfig(filePath));
  ipcMain.handle("desktop:deepLinksReady", (event) => {
    if (event.sender !== mainWindow?.webContents) throw new Error("Deep-link readiness is limited to the main window");
    deepLinkRendererReady = true;
    flushDeepLinkActions();
    return deepLinkSnapshot();
  });
  ipcMain.handle("desktop:updatePreferences", (_event, updates = {}) => {
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) throw new TypeError("Desktop preference updates must be an object");
    if (Object.hasOwn(updates, "launchAtLogin")) {
      if (typeof updates.launchAtLogin !== "boolean") throw new TypeError("Launch at login must be enabled or disabled");
      autostart.setEnabled(updates.launchAtLogin);
    }
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

  ipcMain.handle("updates:getState", () => updateSnapshot());
  ipcMain.handle("updates:setPreferences", (_event, value = {}) => {
    const preferences = normalizeUpdatePreferences(value);
    const result = updateService.setPreferences(preferences);
    const settings = readSettings();
    writeSettings({ ...settings, updates: preferences });
    scheduleAutomaticUpdateCheck(2500);
    log("info", "updater.preferences_updated", preferences);
    return result;
  });
  ipcMain.handle("updates:check", () => updateService.check());
  ipcMain.handle("updates:download", () => updateService.download());
  ipcMain.handle("updates:install", () => {
    isQuitting = true;
    updateService.install();
    return true;
  });
  ipcMain.handle("updates:openReleases", () => shell.openExternal("https://github.com/zk274/linuxcodexzk/releases"));

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

  ipcMain.handle("review:get", (_event, { cwd, forceGitHub = false } = {}) => reviewCenterSnapshot(cwd, { forceGitHub }));
  ipcMain.handle("review:decideHunk", async (_event, { cwd, hunkId, decision } = {}) => {
    const repository = await reviewRepository(cwd);
    if (decision === "reject") {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Reject this hunk?",
        message: "Discard this working-tree hunk?",
        detail: "Only the selected hunk will be reversed. Staged content is preserved.",
        buttons: ["Reject hunk", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (response !== 0) return { cancelled: true, snapshot: await reviewCenterSnapshot(repository) };
    }
    await git.decideHunk(repository, hunkId, decision);
    log("info", "review.hunk_decided", { decision });
    return { cancelled: false, snapshot: await reviewCenterSnapshot(repository) };
  });
  ipcMain.handle("review:runCheck", async (_event, { cwd, checkId } = {}) => {
    const repository = await reviewRepository(cwd);
    const evidence = await runReviewCheck(repository, checkId);
    const entries = [...evidenceFor(repository), evidence].slice(-20);
    reviewEvidence.set(repository, entries);
    log(evidence.passed ? "info" : "warn", "review.check_completed", { checkId: evidence.checkId, passed: evidence.passed, exitCode: evidence.exitCode, durationMs: evidence.durationMs });
    return reviewCenterSnapshot(repository);
  });
  ipcMain.handle("review:createBranch", async (_event, { cwd, branch } = {}) => {
    const repository = await reviewRepository(cwd);
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "question",
      title: "Create Git branch?",
      message: `Create and switch to ${branch || "this branch"}?`,
      detail: "Working and staged changes remain in the checkout.",
      buttons: ["Create branch", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (response !== 0) return { cancelled: true, snapshot: await reviewCenterSnapshot(repository) };
    await git.createBranch(repository, branch);
    githubContextCache.delete(repository);
    return { cancelled: false, snapshot: await reviewCenterSnapshot(repository, { forceGitHub: true }) };
  });
  ipcMain.handle("review:push", async (_event, { cwd, remote = "origin" } = {}) => {
    const repository = await reviewRepository(cwd);
    const status = await git.status(repository);
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "question",
      title: "Push branch?",
      message: `Push ${status.branch} to ${remote}?`,
      detail: "This sets the upstream branch. Force push is never used.",
      buttons: ["Push branch", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (response !== 0) return { cancelled: true, snapshot: await reviewCenterSnapshot(repository) };
    await git.push(repository, { remote });
    githubContextCache.delete(repository);
    return { cancelled: false, snapshot: await reviewCenterSnapshot(repository, { forceGitHub: true }) };
  });
  ipcMain.handle("review:createDraftPr", async (_event, { cwd, title, body, base } = {}) => {
    const repository = await reviewRepository(cwd);
    const status = await git.status(repository);
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "question",
      title: "Create draft pull request?",
      message: `${status.branch} → ${base || "main"}`,
      detail: title || "Untitled pull request",
      buttons: ["Create draft PR", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (response !== 0) return { cancelled: true, snapshot: await reviewCenterSnapshot(repository) };
    const result = await github.createDraftPullRequest(repository, { title, body, base, head: status.branch });
    githubContextCache.delete(repository);
    return { cancelled: false, result, snapshot: await reviewCenterSnapshot(repository, { forceGitHub: true }) };
  });
  ipcMain.handle("review:showPolicy", async (_event, { cwd, policyPath } = {}) => {
    const repository = await reviewRepository(cwd);
    if (typeof policyPath !== "string" || path.isAbsolute(policyPath)) throw new Error("Policy path must be relative to the repository");
    const target = path.resolve(repository, policyPath);
    const relative = path.relative(repository, target);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || !fs.existsSync(target)) throw new Error("Policy file is outside the repository or unavailable");
    shell.showItemInFolder(target);
    return true;
  });
  ipcMain.handle("review:copyTaskSummary", () => {
    clipboard.writeText(redactedTaskMarkdown(taskSnapshot()));
    return true;
  });
  ipcMain.handle("review:copyDiagnostics", async () => {
    clipboard.writeText(redactedDiagnosticsMarkdown(await diagnosticsSnapshot()));
    return true;
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
    clipboard.writeText(redactedDiagnosticsMarkdown(await diagnosticsSnapshot()));
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

function createWindow({ show = true } = {}) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: "#171816",
    show,
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#171816", symbolColor: "#e7e9df", height: 44 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const windowSession = mainWindow.webContents.session;
  mainWindow.webContents.on("did-start-loading", () => { deepLinkRendererReady = false; });
  windowSession.setPermissionCheckHandler((webContents, permission, _requestingOrigin, details = {}) => cameraPermissionCheckAllowed({
    trustedWindow: webContents === mainWindow?.webContents,
    permission,
    mediaType: details.mediaType,
  }));
  windowSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => callback(cameraPermissionRequestAllowed({
    trustedWindow: webContents === mainWindow?.webContents,
    permission,
    mediaTypes: details.mediaTypes,
  })));
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
  const captureArgument = process.argv.find((argument) => argument.startsWith("--capture-ui=") || argument.startsWith("--capture-long-thread-ui=") || argument.startsWith("--capture-titlebar-menu-ui=") || argument.startsWith("--capture-diagnostics-ui=") || argument.startsWith("--capture-settings-ui=") || argument.startsWith("--capture-tasks-ui=") || /^--capture-review(?:-(?:ship|github|policy))?-ui=/.test(argument) || /^--capture-studio(?:-(?:search|templates|voice))?-ui=/.test(argument) || argument.startsWith("--capture-extensions-ui=") || argument.startsWith("--capture-accessibility-ui=") || argument.startsWith("--capture-updates-ui=") || argument.startsWith("--capture-region-ui=") || argument.startsWith("--capture-camera-ui=") || argument.startsWith("--capture-live-camera-ui=") || argument.startsWith("--capture-camera-attachment-ui="));
  if (captureArgument) mainWindow.webContents.once("did-finish-load", () => setTimeout(async () => {
    if (captureArgument.startsWith("--capture-long-thread-ui=")) {
      await mainWindow.webContents.executeJavaScript(`(() => {
        document.querySelector("#threadTitle").textContent = "Oversized thread layout test";
        document.querySelector("#projectPath").textContent = "/tmp/large-project";
        document.querySelector("#homeButton").disabled = false;
        document.querySelector("#welcome").hidden = true;
        const messages = document.querySelector("#messages");
        messages.hidden = false;
        messages.style.display = "block";
        messages.replaceChildren();
        for (let index = 1; index <= 24; index += 1) {
          const turn = document.createElement("section");
          turn.className = "turn";
          const user = document.createElement("div");
          user.className = "message user";
          user.textContent = "Test prompt " + index;
          const agent = document.createElement("div");
          agent.className = "message agent";
          agent.textContent = "This synthetic response verifies that a long conversation scrolls inside its pane while the composer remains visible and usable.";
          turn.append(user, agent);
          messages.append(turn);
        }
        const prompt = document.querySelector("#promptInput");
        prompt.disabled = false;
        prompt.placeholder = "Continue this thread…";
        const conversation = document.querySelector("#conversation");
        conversation.scrollTop = Math.floor((conversation.scrollHeight - conversation.clientHeight) / 2);
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const layout = await mainWindow.webContents.executeJavaScript(`(() => {
        const conversation = document.querySelector("#conversation");
        const composer = document.querySelector("#composer").getBoundingClientRect();
        const account = document.querySelector("#accountButton").getBoundingClientRect();
        return {
          turns: document.querySelector("#messages").children.length,
          scrollHeight: conversation.scrollHeight,
          clientHeight: conversation.clientHeight,
          scrollTop: conversation.scrollTop,
          composerBottom: composer.bottom,
          accountBottom: account.bottom,
          viewportHeight: window.innerHeight,
        };
      })()`);
      if (layout.turns !== 24 || layout.scrollHeight <= layout.clientHeight || layout.scrollTop <= 0 || layout.composerBottom > layout.viewportHeight || layout.accountBottom > layout.viewportHeight) {
        throw new Error(`Oversized thread layout validation failed: ${JSON.stringify(layout)}`);
      }
    } else if (captureArgument.startsWith("--capture-titlebar-menu-ui=")) {
      await mainWindow.webContents.executeJavaScript(`(async () => {
        const button = document.querySelector("#brandMenuButton");
        const menu = document.querySelector("#brandMenu");
        button.click();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const navigationBounds = document.querySelector(".titlebar-navigation").getBoundingClientRect();
        const buttonBounds = button.getBoundingClientRect();
        const menuBounds = menu.getBoundingClientRect();
        const state = {
          menuOpen: !menu.hidden && button.getAttribute("aria-expanded") === "true",
          settingsInMenu: menu.contains(document.querySelector("#settingsButton")),
          extensionsInMenu: menu.contains(document.querySelector("#extensionsButton")),
          navigationCentered: Math.abs(navigationBounds.left + navigationBounds.width / 2 - window.innerWidth / 2) < 1,
          menuAnchored: Math.abs(menuBounds.left - buttonBounds.left) < 1 && menuBounds.top >= buttonBounds.bottom,
        };
        if (!state.menuOpen || !state.settingsInMenu || !state.extensionsInMenu || !state.navigationCentered || !state.menuAnchored) {
          throw new Error("Titlebar menu validation failed: " + JSON.stringify(state));
        }
        document.body.click();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (!menu.hidden) throw new Error("Titlebar menu outside-click validation failed");
        button.click();
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    } else if (captureArgument.startsWith("--capture-diagnostics-ui=")) {
      await mainWindow.webContents.executeJavaScript("document.querySelector('#moreButton').click()");
      await new Promise((resolve) => setTimeout(resolve, 500));
    } else if (captureArgument.startsWith("--capture-settings-ui=")) {
      await mainWindow.webContents.executeJavaScript("document.querySelector('#accountButton').click()");
      await new Promise((resolve) => setTimeout(resolve, 500));
    } else if (captureArgument.startsWith("--capture-tasks-ui=")) {
      if (!taskStore.tasks.length) {
        const repository = process.cwd();
        const active = taskStore.create({
          title: "Implement durable task recovery",
          prompt: "Add restart-safe task recovery and verify it with automated tests.",
          repository,
          isolation: "worktree",
          model: "gpt-5.6",
          effort: "high",
        });
        taskStore.prepare(active.id, { cwd: path.join(taskWorktreeRoot(), "capture-task"), worktreePath: path.join(taskWorktreeRoot(), "capture-task") });
        taskStore.running(active.id, { threadId: `capture-thread-${active.id}`, turnId: `capture-turn-${active.id}` });
        taskStore.observeItem(`capture-thread-${active.id}`, {
          id: "capture-collab",
          type: "collabAgentToolCall",
          tool: "spawnAgent",
          status: "completed",
          senderThreadId: `capture-thread-${active.id}`,
          receiverThreadIds: ["capture-agent-reviewer"],
          agentsStates: { "capture-agent-reviewer": { status: "running", message: "Reviewing recovery edge cases" } },
          model: "gpt-5.6-terra",
          reasoningEffort: "medium",
        });
        taskStore.waiting(active.id, "capture-request", "approval");
        taskStore.create({
          title: "Audit worktree safety",
          prompt: "Review managed worktree path validation.",
          repository,
          isolation: "worktree",
        });
        taskStore.addInbox({ kind: "terminal", title: "Test terminal exited with code 1", detail: "Open the project terminal to inspect its output." });
      }
      await mainWindow.webContents.executeJavaScript("document.querySelector('#tasksButton').click()");
      await new Promise((resolve) => setTimeout(resolve, 800));
    } else if (/^--capture-review(?:-(?:ship|github|policy))?-ui=/.test(captureArgument)) {
      const repository = process.cwd();
      activeThreadContext = { id: "capture-review-thread", cwd: repository, title: "Review 0.7 changes" };
      const review = await git.review(repository, {
        evidence: [{ id: "capture-check", checkId: "npm:check", label: "npm run check", passed: true, exitCode: 0, output: "108 tests passed", durationMs: 1830, completedAt: Date.now() }],
      });
      const policy = repositoryPolicySnapshot(repository, {
        hooksPath: await git.hooksPath(repository),
        remote: { protected: true, requiredChecks: ["Build, syntax, and tests"], requiredReviews: 1, requireConversationResolution: true },
      });
      sendEvent({
        kind: "captureReview",
        thread: activeThreadContext,
        snapshot: {
          review,
          checks: discoverReviewChecks(repository),
          policy,
          github: {
            available: true,
            cliVersion: "gh 2.80.0",
            repository: { name: "zk274/linuxcodexzk", url: "https://github.com/zk274/linuxcodexzk", defaultBranch: "main", visibility: "private", viewerPermission: "admin" },
            issues: [{ number: 14, title: "Review keyboard navigation", state: "open", updatedAt: new Date().toISOString(), url: "https://github.com/zk274/linuxcodexzk/issues/14", labels: ["accessibility"], assignees: [] }],
            pulls: [{ number: 12, title: "Add Task Center recovery", state: "open", draft: false, head: "tasks", base: "main", reviewDecision: "approved", checks: [{ name: "CI", status: "completed", conclusion: "SUCCESS" }], updatedAt: new Date().toISOString(), url: "https://github.com/zk274/linuxcodexzk/pull/12" }],
            runs: [{ id: 123, name: "Build, syntax, and tests", workflow: "CI", status: "completed", conclusion: "success", branch: "main", event: "push", createdAt: new Date().toISOString(), url: "https://github.com/zk274/linuxcodexzk/actions/runs/123" }],
            currentPull: null,
            reviewComments: [{ id: 22, author: "reviewer", path: "src/main/git-service.mjs", line: 154, body: "Keep the server-side hunk validation.", createdAt: new Date().toISOString(), url: "https://github.com/zk274/linuxcodexzk/pull/12#discussion_r22" }],
            protection: { protected: true, requiredChecks: ["Build, syntax, and tests"], requiredReviews: 1, requireCodeOwners: false, requireConversationResolution: true, enforceAdmins: false },
          },
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 800));
      const captureTab = captureArgument.startsWith("--capture-review-ship-ui=")
        ? "ship"
        : captureArgument.startsWith("--capture-review-github-ui=")
          ? "github"
          : captureArgument.startsWith("--capture-review-policy-ui=")
            ? "policy"
            : null;
      if (captureTab) {
        await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-review-tab="${captureTab}"]').click()`);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } else if (/^--capture-studio(?:-(?:search|templates|voice))?-ui=/.test(captureArgument)) {
      const repository = process.cwd();
      activeThreadContext = { id: "capture-studio-thread", cwd: repository, title: "Create the 0.8 workspace" };
      const now = Date.now();
      const captureTab = captureArgument.startsWith("--capture-studio-search-ui=")
        ? "search"
        : captureArgument.startsWith("--capture-studio-templates-ui=")
          ? "templates"
          : captureArgument.startsWith("--capture-studio-voice-ui=")
            ? "voice"
            : "canvas";
      sendEvent({
        kind: "captureStudio",
        tab: captureTab,
        thread: activeThreadContext,
        creation: {
          templates: [
            { id: "builtin:review", name: "Review current changes", description: "Audit changes and run checks.", prompt: "Review the current changes.", isolation: "worktree", baseRef: "HEAD", model: null, effort: null, builtin: true, createdAt: 0, updatedAt: 0 },
            { id: "capture-template", name: "Ship a milestone", description: "Finish, verify, and prepare a private milestone.", prompt: "Finish the milestone and run the complete release gate.", isolation: "worktree", baseRef: "HEAD", model: null, effort: "high", builtin: false, createdAt: now, updatedAt: now },
          ],
          artifacts: [
            { id: "capture-plan", title: "0.8 richer creation plan", kind: "plan", body: "# 0.8 — Richer creation\n\nBuild a focused creation workspace beside every Codex thread.\n\n## Release gates\n\n- Keyboard-complete UI\n- Local-first persistence\n- Verified Linux packages", repository, createdAt: now, updatedAt: now },
            { id: "capture-spec", title: "Voice safety boundary", kind: "specification", body: "# Voice boundary\n\nStream audio only during an active session.", repository, createdAt: now - 60_000, updatedAt: now - 60_000 },
          ],
        },
        voiceCapability: { available: true, voices: ["cedar", "marin", "verse"], defaultVoice: "cedar", experimental: true },
        searchResults: [
          { kind: "thread", id: "thread-result", title: "Richer creation milestone", detail: "Implement Canvas, local search, templates, and voice.", threadId: "capture-studio-thread", project: "linuxcodexzk", updatedAt: now },
          { kind: "task", id: "task-result", title: "Verify packaged creation tools", detail: "Completed all artifact and accessibility checks.", taskId: "capture-task", state: "completed", updatedAt: now - 1_000 },
          { kind: "artifact", id: "artifact-result", title: "0.8 richer creation plan", detail: "Build a focused creation workspace beside every Codex thread.", artifactId: "capture-plan", artifactKind: "plan", updatedAt: now - 2_000 },
          { kind: "file", id: "file-result", title: "src/main/creation-service.mjs", detail: "CreationStore provides durable local artifacts and task templates.", repository, relativePath: "src/main/creation-service.mjs", updatedAt: now - 3_000 },
        ],
      });
      await new Promise((resolve) => setTimeout(resolve, 800));
    } else if (captureArgument.startsWith("--capture-extensions-ui=")) {
      await mainWindow.webContents.executeJavaScript("document.querySelector('#extensionsButton').click()");
      await new Promise((resolve) => setTimeout(resolve, 1800));
    } else if (captureArgument.startsWith("--capture-accessibility-ui=")) {
      await mainWindow.webContents.executeJavaScript(`(async () => {
        document.querySelector("#accountButton").click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        const scale = document.querySelector("#textScaleSelect");
        scale.value = "1.25";
        scale.dispatchEvent(new Event("change", { bubbles: true }));
        const contrast = document.querySelector("#highContrastInput");
        if (!contrast.checked) contrast.click();
        scale.scrollIntoView({ block: "center" });
        scale.focus();
        await new Promise((resolve) => setTimeout(resolve, 150));
        const dialog = document.querySelector(".auth-dialog");
        const state = {
          dialogOpen: !document.querySelector("#authOverlay").hidden,
          dialogOwnsFocus: dialog.contains(document.activeElement),
          backgroundInert: document.querySelector(".app-shell").inert && document.querySelector(".titlebar").inert,
          highContrast: document.documentElement.classList.contains("high-contrast"),
          scale: scale.value,
          titlebarSafeArea: Number.parseFloat(getComputedStyle(document.querySelector(".titlebar")).paddingRight) >= 150,
        };
        if (!state.dialogOpen || !state.dialogOwnsFocus || !state.backgroundInert || !state.highContrast || state.scale !== "1.25" || !state.titlebarSafeArea) {
          throw new Error("Accessibility UI validation failed: " + JSON.stringify(state));
        }
        document.querySelector("#authOverlay").click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const backdropDismissed = document.querySelector("#authOverlay").hidden && !document.querySelector(".app-shell").inert && !document.querySelector(".titlebar").inert;
        if (!backdropDismissed) throw new Error("Dialog backdrop validation failed");
        document.querySelector("#accountButton").click();
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } else if (captureArgument.startsWith("--capture-updates-ui=")) {
      await mainWindow.webContents.executeJavaScript("document.querySelector('#accountButton').click()");
      await new Promise((resolve) => setTimeout(resolve, 500));
      await mainWindow.webContents.executeJavaScript("document.querySelector('.auth-dialog').scrollTop = document.querySelector('.auth-dialog').scrollHeight");
      await new Promise((resolve) => setTimeout(resolve, 250));
    } else if (captureArgument.startsWith("--capture-camera-attachment-ui=")) {
      await mainWindow.webContents.executeJavaScript("document.querySelector('#cameraButton').click()");
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const ready = await mainWindow.webContents.executeJavaScript("!document.querySelector('#captureCameraButton').disabled");
      if (!ready) throw new Error("Synthetic camera did not become ready");
      await mainWindow.webContents.executeJavaScript("document.querySelector('#captureCameraButton').click()");
      await new Promise((resolve) => setTimeout(resolve, 1200));
    } else if (captureArgument.startsWith("--capture-live-camera-ui=")) {
      await mainWindow.webContents.executeJavaScript("document.querySelector('#cameraButton').click()");
      await new Promise((resolve) => setTimeout(resolve, 2500));
    } else if (captureArgument.startsWith("--capture-camera-ui=")) {
      const preview = `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'><defs><radialGradient id='g'><stop stop-color='#34473f'/><stop offset='1' stop-color='#11130f'/></radialGradient></defs><rect width='1280' height='720' fill='url(#g)'/><circle cx='640' cy='288' r='112' fill='#9cf0c4' opacity='.2'/><circle cx='640' cy='288' r='74' fill='#9cf0c4' opacity='.24'/><path d='M380 620c34-150 143-225 260-225s226 75 260 225' fill='#9cf0c4' opacity='.17'/><text x='640' y='675' fill='#92968a' text-anchor='middle' font-family='sans-serif' font-size='27'>Live camera preview</text></svg>")}`;
      await mainWindow.webContents.executeJavaScript(`(() => {
        const overlay = document.querySelector("#cameraOverlay");
        overlay.hidden = false;
        const video = document.querySelector("#cameraVideo");
        video.hidden = true;
        const previewSurface = document.querySelector(".camera-preview");
        previewSurface.style.background = "center / contain no-repeat url(" + ${JSON.stringify(JSON.stringify(preview))} + "), #0d0e0c";
        document.querySelector("#cameraPreviewState").hidden = true;
        const field = document.querySelector("#cameraDeviceField");
        const select = document.querySelector("#cameraDeviceSelect");
        field.hidden = false;
        select.replaceChildren(new Option("Integrated Camera", "integrated"), new Option("USB Camera", "usb"));
        document.querySelector("#cameraResolution").textContent = "1280 × 720";
        document.querySelector("#captureCameraButton").disabled = false;
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } else if (captureArgument.startsWith("--capture-region-ui=")) {
      const preview = `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='1440' height='900'><defs><linearGradient id='g' x2='1' y2='1'><stop stop-color='#20342f'/><stop offset='1' stop-color='#20211d'/></linearGradient></defs><rect width='1440' height='900' fill='url(#g)'/><rect x='90' y='90' width='1260' height='720' rx='24' fill='#171816' stroke='#4b4d43' stroke-width='3'/><text x='150' y='190' fill='#ecede5' font-family='sans-serif' font-size='54'>Captured workspace preview</text><text x='150' y='250' fill='#92968a' font-family='sans-serif' font-size='28'>Drag to select only the pixels you want to attach.</text><rect x='150' y='330' width='500' height='330' rx='18' fill='#242520'/><rect x='700' y='330' width='590' height='90' rx='18' fill='#2a2c25'/><rect x='700' y='450' width='590' height='210' rx='18' fill='#1d1e1a'/></svg>")}`;
      await mainWindow.webContents.executeJavaScript(`(async () => {
        const overlay = document.querySelector("#regionOverlay");
        const image = document.querySelector("#regionImage");
        const selection = document.querySelector("#regionSelection");
        document.querySelector("#regionTitle").textContent = "Select part of Captured workspace preview";
        const loaded = new Promise((resolve) => image.addEventListener("load", resolve, { once: true }));
        image.src = ${JSON.stringify(preview)};
        overlay.hidden = false;
        await loaded;
        selection.hidden = false;
        Object.assign(selection.style, { left: "28%", top: "27%", width: "46%", height: "42%" });
        document.querySelector("#regionStatus").textContent = "662 × 378 pixels selected";
        document.querySelector("#captureRegionButton").disabled = false;
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const image = await mainWindow.webContents.capturePage();
    fs.writeFileSync(captureArgument.slice(captureArgument.indexOf("=") + 1), image.toPNG());
    app.quit();
  }, 2500));
  const packagedLaunchTestArgument = process.argv.find((argument) => argument.startsWith("--test-packaged-launch="));
  if (packagedLaunchTestArgument) mainWindow.webContents.once("did-finish-load", () => setTimeout(async () => {
    const outputPath = path.resolve(packagedLaunchTestArgument.slice(packagedLaunchTestArgument.indexOf("=") + 1));
    const temporaryRoot = path.resolve(os.tmpdir());
    if (outputPath === temporaryRoot || !outputPath.startsWith(`${temporaryRoot}${path.sep}`)) {
      log("error", "automation.packaged_launch_path_rejected", { path: outputPath });
      app.exit(1);
      return;
    }
    try {
      const renderer = await mainWindow.webContents.executeJavaScript(`(() => ({
        readyState: document.readyState,
        hasComposer: Boolean(document.querySelector("#composer")),
        hasAuthDialog: Boolean(document.querySelector("#authOverlay")),
        title: document.title,
      }))()`);
      const status = cliStatus();
      fs.writeFileSync(outputPath, `${JSON.stringify({
        packaged: app.isPackaged,
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        renderer,
        codexFound: status.found,
      }, null, 2)}\n`, { mode: 0o600 });
      app.quit();
    } catch (error) {
      log("error", "automation.packaged_launch_failed", { message: error.message });
      app.exit(1);
    }
  }, 500));
  const notificationTestArgument = process.argv.find((argument) => argument.startsWith("--test-notification="));
  if (notificationTestArgument) mainWindow.webContents.once("did-finish-load", () => setTimeout(() => {
    const result = showDesktopNotification("turn", {
      id: `test-${Date.now()}`,
      target: { kind: "thread", threadId: null },
      ignoreFocus: true,
    });
    fs.writeFileSync(notificationTestArgument.slice(notificationTestArgument.indexOf("=") + 1), `${JSON.stringify({ ...result, supported: notificationSnapshot().supported })}\n`);
    setTimeout(() => app.quit(), 1500);
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

function queueDeepLinkAction(action) {
  pendingDeepLinkActions.push(action);
  if (pendingDeepLinkActions.length > 20) {
    pendingDeepLinkActions.shift();
    log("warn", "deep_link.queue_trimmed");
  }
  flushDeepLinkActions();
}

function flushDeepLinkActions() {
  if (!deepLinkRendererReady || !mainWindow || mainWindow.isDestroyed()) return;
  while (pendingDeepLinkActions.length) {
    mainWindow.webContents.send("codex:event", { kind: "deepLink", action: pendingDeepLinkActions.shift() });
  }
}

function rejectDeepLink(message, source) {
  deepLinkState.rejected += 1;
  deepLinkState.lastSource = source;
  deepLinkState.lastError = message;
  log("warn", "deep_link.rejected", { source, message });
  queueDeepLinkAction({ kind: "error", message });
}

async function handleDeepLinkArgument(argument, source) {
  showMainWindow();
  let action;
  try {
    action = parseDeepLink(argument);
  } catch (error) {
    rejectDeepLink(error.message, source);
    return;
  }

  if (action.kind === "project") {
    let realPath;
    try {
      realPath = fs.realpathSync(action.cwd);
      if (!fs.statSync(realPath).isDirectory()) throw new Error("The project path is not a directory.");
    } catch (error) {
      rejectDeepLink(`The linked project directory is unavailable: ${error.message}`, source);
      return;
    }
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "question",
      title: "Open linked project?",
      message: "Open this project in Codex Linux Community?",
      detail: realPath,
      buttons: ["Open project", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (response !== 0) {
      deepLinkState.cancelled += 1;
      deepLinkState.lastKind = action.kind;
      deepLinkState.lastSource = source;
      log("info", "deep_link.cancelled", { source, kind: action.kind });
      return;
    }
    action = { kind: "project", cwd: realPath };
  }

  deepLinkState.handled += 1;
  deepLinkState.lastKind = action.kind;
  deepLinkState.lastSource = source;
  deepLinkState.lastError = null;
  log("info", "deep_link.handled", { source, kind: action.kind });
  queueDeepLinkAction(action);
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

function initializeAutostart() {
  const testArgument = !app.isPackaged
    ? process.argv.find((argument) => argument.startsWith("--autostart-test-dir="))
    : null;
  let testDirectory = null;
  if (testArgument) {
    const candidate = path.resolve(testArgument.slice(testArgument.indexOf("=") + 1));
    const temporaryRoot = path.resolve(os.tmpdir());
    if (candidate !== temporaryRoot && candidate.startsWith(`${temporaryRoot}${path.sep}`)) testDirectory = candidate;
    else log("warn", "desktop.autostart_test_directory_rejected", { path: candidate });
  }
  const testMode = Boolean(testDirectory);
  const directory = testDirectory || path.join(resolveXdgConfigHome({
    xdgConfigHome: process.env.XDG_CONFIG_HOME,
    home: os.homedir(),
  }), "autostart");
  autostart = new XdgAutostart({
    directory,
    executable: resolveAutostartExecutable({ execPath: app.getPath("exe"), env: process.env }),
    available: process.platform === "linux" && (app.isPackaged || testMode),
    testMode,
  });
  try {
    const status = autostart.refresh();
    log(status.reason ? "warn" : "info", "desktop.autostart_initialized", status);
  } catch (error) {
    log("warn", "desktop.autostart_refresh_failed", { message: error.message, filePath: autostart.filePath });
  }
}

function updaterLogMessage(values) {
  return values.map((value) => {
    if (value instanceof Error) return value.message;
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  }).join(" ").slice(0, 1000);
}

function scheduleAutomaticUpdateCheck(delay = 10_000) {
  if (updateCheckTimer) clearTimeout(updateCheckTimer);
  updateCheckTimer = null;
  const snapshot = updateSnapshot();
  const automationRun = process.argv.some((argument) => /^--(?:capture|test)-/.test(argument));
  if (!snapshot.supported || !snapshot.preferences.autoCheck || automationRun) return;
  updateCheckTimer = setTimeout(() => {
    updateCheckTimer = null;
    if (updateSnapshot().canCheck) updateService.check().catch(() => {});
  }, delay);
  updateCheckTimer.unref();
}

function initializeUpdater() {
  autoUpdater.logger = {
    info: (...values) => log("info", "updater.library", { message: updaterLogMessage(values) }),
    warn: (...values) => log("warn", "updater.library", { message: updaterLogMessage(values) }),
    error: (...values) => log("error", "updater.library", { message: updaterLogMessage(values) }),
    debug: (...values) => log("debug", "updater.library", { message: updaterLogMessage(values) }),
  };
  updateService = new UpdateService({
    updater: autoUpdater,
    currentVersion: app.getVersion(),
    packageType: detectLinuxPackageType({
      packaged: app.isPackaged,
      env: process.env,
      execPath: app.getPath("exe"),
      resourcesPath: process.resourcesPath,
    }),
    preferences: updatePreferences(),
    onChange: (updates) => sendEvent({ kind: "updateState", updates }),
    log,
  });
  log("info", "updater.initialized", updateSnapshot());
  scheduleAutomaticUpdateCheck();
  updateCheckInterval = setInterval(() => {
    const snapshot = updateSnapshot();
    if (snapshot.supported && snapshot.preferences.autoCheck && snapshot.canCheck) updateService.check().catch(() => {});
  }, 6 * 60 * 60 * 1000);
  updateCheckInterval.unref();
}

if (singleInstanceLockAcquired) app.on("second-instance", (_event, argv, _workingDirectory, additionalData = {}) => {
  const argument = additionalData && typeof additionalData.deepLink === "string"
    ? additionalData.deepLink
    : extractDeepLinkArgument(argv);
  if (argument) void handleDeepLinkArgument(argument, "second-instance");
  else showMainWindow();
});

if (singleInstanceLockAcquired) app.whenReady().then(() => {
  sessionMarkerPath = path.join(app.getPath("userData"), "running.lock");
  previousUncleanShutdown = fs.existsSync(sessionMarkerPath);
  fs.mkdirSync(path.dirname(sessionMarkerPath), { recursive: true });
  fs.writeFileSync(sessionMarkerPath, String(process.pid), { mode: 0o600 });
  logger = new StructuredLogger(path.join(app.getPath("userData"), "logs", "app.jsonl"));
  log("info", "app.started", { version: app.getVersion(), packaged: app.isPackaged, platform: process.platform, arch: process.arch, previousUncleanShutdown });
  initializeAutostart();
  initializeUpdater();
  initializeTasks();
  initializeCreation();
  registerIpc();
  const startedByAutostart = process.argv.includes("--autostart");
  const backgroundStartup = startedByAutostart && !initialDeepLinkArgument;
  createWindow({ show: !backgroundStartup });
  createCompanionWindow();
  registerQuickPromptShortcut();
  updateTray();
  if (backgroundStartup && !tray) showMainWindow();
  log("info", "desktop.startup_mode", { autostart: startedByAutostart, background: backgroundStartup && Boolean(tray) });
  if (initialDeepLinkArgument) void handleDeepLinkArgument(initialDeepLinkArgument, "initial");
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
  if (updateCheckTimer) clearTimeout(updateCheckTimer);
  if (updateCheckInterval) clearInterval(updateCheckInterval);
  updateCheckTimer = null;
  updateCheckInterval = null;
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
