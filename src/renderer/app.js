import {
  activateTerminal,
  activeTerminal,
  appendTerminalOutput,
  createTerminalCollection,
  createTerminalTab,
  removeTerminal,
  runningTerminalCount,
  terminalForHandle,
  unreadTerminalCount,
} from "./terminal-state.mjs";
import { selectionFromPoints, selectionToImage } from "../shared/capture-region.mjs";

const api = window.codexDesktop;
const $ = (selector) => document.querySelector(selector);
const state = { connected: false, connectionError: null, account: null, cli: null, compatibility: null, desktop: null, updates: null, loginPending: false, restorationAttempted: false, threads: [], models: [], activeThread: null, turns: [], activeTurnId: null, diff: "", diffView: "working", git: null, gitDiffs: { working: "", staged: "" }, gitSelection: null, gitFileDiff: "", attachments: [], terminals: createTerminalCollection(), requestQueue: [], currentRequest: null, pendingDeepLinks: [], flushingDeepLinks: false };
const regionCapture = { source: null, start: null, selection: null, dragging: false };
const cameraCapture = { stream: null, requestId: 0, devices: [] };

const els = {
  home: $("#homeButton"), brandMenuButton: $("#brandMenuButton"), brandMenu: $("#brandMenu"), settings: $("#settingsButton"),
  threadList: $("#threadList"), threadSearch: $("#threadSearch"), refresh: $("#refreshButton"),
  newThread: $("#newThreadButton"), openProject: $("#openProjectButton"), folder: $("#folderButton"), folderName: $("#folderName"),
  threadTitle: $("#threadTitle"), projectPath: $("#projectPath"), welcome: $("#welcome"), messages: $("#messages"), conversation: $("#conversation"),
  prompt: $("#promptInput"), send: $("#sendButton"), stop: $("#stopButton"), model: $("#modelSelect"), effort: $("#effortSelect"),
  accountName: $("#accountName"), accountPlan: $("#accountPlan"), connectionDot: $("#connectionDot"), diffButton: $("#diffButton"),
  diffBadge: $("#diffBadge"), diffPanel: $("#diffPanel"), diffContent: $("#diffContent"), diffSummary: $("#diffSummary"), closeDiff: $("#closeDiffButton"),
  diffFiles: $("#diffFiles"), gitSelection: $("#gitSelection"), gitPrimary: $("#gitPrimaryAction"), gitDiscard: $("#gitDiscardButton"),
  gitCommitForm: $("#gitCommitForm"), gitCommitMessage: $("#gitCommitMessage"), gitCommitButton: $("#gitCommitButton"),
  toast: $("#toast"), overlay: $("#requestOverlay"), requestKind: $("#requestKind"), requestTitle: $("#requestTitle"),
  requestReason: $("#requestReason"), requestCommand: $("#requestCommand"), requestQuestions: $("#requestQuestions"),
  deny: $("#denyRequestButton"), allowSession: $("#allowSessionButton"), allow: $("#allowRequestButton"),
  accountButton: $("#accountButton"), authOverlay: $("#authOverlay"), closeAuth: $("#closeAuthButton"), authEyebrow: $("#authEyebrow"),
  authTitle: $("#authTitle"), authDescription: $("#authDescription"), cliLocation: $("#cliLocation"), cliPath: $("#cliPath"),
  retryConnection: $("#retryConnectionButton"), chooseCli: $("#chooseCliButton"), signIn: $("#signInButton"), logout: $("#logoutButton"), authDocs: $("#authDocsButton"),
  shortcutSelect: $("#shortcutSelect"), shortcutPreferenceStatus: $("#shortcutPreferenceStatus"), trayEnabled: $("#trayEnabledInput"), closeToTray: $("#closeToTrayInput"), trayPreferenceStatus: $("#trayPreferenceStatus"),
  launchAtLogin: $("#launchAtLoginInput"), autostartPreferenceStatus: $("#autostartPreferenceStatus"),
  textScale: $("#textScaleSelect"), reduceMotion: $("#reduceMotionInput"), highContrast: $("#highContrastInput"), accessibilityPreferenceStatus: $("#accessibilityPreferenceStatus"),
  notifyTurnComplete: $("#notifyTurnCompleteInput"), notifyApproval: $("#notifyApprovalInput"), notifyTerminal: $("#notifyTerminalInput"), notificationPreferenceStatus: $("#notificationPreferenceStatus"),
  updateChannel: $("#updateChannelSelect"), autoCheckUpdates: $("#autoCheckUpdatesInput"), updatePreferenceStatus: $("#updatePreferenceStatus"),
  checkUpdates: $("#checkUpdatesButton"), downloadUpdate: $("#downloadUpdateButton"), installUpdate: $("#installUpdateButton"), viewReleases: $("#viewReleasesButton"),
  gitBranch: $("#gitBranch"), refreshGit: $("#refreshGitButton"), terminalButton: $("#terminalButton"), terminalBadge: $("#terminalBadge"), terminalPanel: $("#terminalPanel"),
  terminalTabs: $("#terminalTabs"), terminalTitle: $("#terminalTitle"), terminalStatus: $("#terminalStatus"), terminalOutput: $("#terminalOutput"), terminalForm: $("#terminalForm"), terminalInput: $("#terminalInput"),
  newTerminal: $("#newTerminalButton"), closeTerminal: $("#closeTerminalButton"), restartTerminal: $("#restartTerminalButton"), attachmentTray: $("#attachmentTray"), attach: $("#attachButton"), screenshot: $("#screenshotButton"), camera: $("#cameraButton"), composer: $("#composer"),
  screenshotOverlay: $("#screenshotOverlay"), closeCapture: $("#closeCaptureButton"), captureHint: $("#captureHint"), captureSources: $("#captureSources"),
  cameraOverlay: $("#cameraOverlay"), closeCamera: $("#closeCameraButton"), cancelCamera: $("#cancelCameraButton"), cameraDescription: $("#cameraDescription"),
  cameraDeviceField: $("#cameraDeviceField"), cameraDevice: $("#cameraDeviceSelect"), cameraVideo: $("#cameraVideo"), cameraPreviewState: $("#cameraPreviewState"),
  cameraResolution: $("#cameraResolution"), captureCamera: $("#captureCameraButton"),
  regionOverlay: $("#regionOverlay"), regionCanvas: $("#regionCanvas"), regionImage: $("#regionImage"), regionSelection: $("#regionSelection"),
  regionStatus: $("#regionStatus"), closeRegion: $("#closeRegionButton"), cancelRegion: $("#cancelRegionButton"), captureRegion: $("#captureRegionButton"),
  more: $("#moreButton"), diagnosticsOverlay: $("#diagnosticsOverlay"), closeDiagnostics: $("#closeDiagnosticsButton"), diagnosticsStatus: $("#diagnosticsStatus"), diagnosticsContent: $("#diagnosticsContent"),
  showLog: $("#showLogButton"), copyDiagnostics: $("#copyDiagnosticsButton"), exportDiagnostics: $("#exportDiagnosticsButton"),
};

const reduceMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
const highContrastQuery = matchMedia("(prefers-contrast: more)");
const dialogReturnFocus = new WeakMap();

function isVisible(element) {
  return Boolean(element?.isConnected && !element.closest("[hidden]") && element.getClientRects().length);
}

function focusableElements(container) {
  return [...container.querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex='-1'])")]
    .filter(isVisible);
}

function modalOverlays() {
  return [els.overlay, els.authOverlay, els.screenshotOverlay, els.cameraOverlay, els.diagnosticsOverlay, els.regionOverlay];
}

function activeModal() {
  return modalOverlays().findLast((overlay) => !overlay.hidden) || null;
}

function syncModalInert() {
  const modalOpen = Boolean(activeModal());
  document.querySelector(".titlebar").inert = modalOpen;
  document.querySelector(".app-shell").inert = modalOpen;
}

function showDialog(overlay, preferredFocus = null) {
  if (overlay.hidden) {
    const current = document.activeElement;
    dialogReturnFocus.set(overlay, current instanceof HTMLElement ? current : null);
  }
  overlay.hidden = false;
  syncModalInert();
  requestAnimationFrame(() => {
    const target = isVisible(preferredFocus) ? preferredFocus : focusableElements(overlay)[0];
    target?.focus();
  });
}

function hideDialog(overlay, fallbackFocus = els.brandMenuButton) {
  if (overlay.hidden) return;
  overlay.hidden = true;
  syncModalInert();
  const previous = dialogReturnFocus.get(overlay);
  dialogReturnFocus.delete(overlay);
  requestAnimationFrame(() => (isVisible(previous) ? previous : fallbackFocus)?.focus());
}

function trapModalFocus(event, overlay) {
  if (event.key !== "Tab") return false;
  const focusable = focusableElements(overlay);
  if (!focusable.length) {
    event.preventDefault();
    return true;
  }
  const first = focusable[0], last = focusable.at(-1);
  if (!overlay.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
  return true;
}

function closeActiveModal(overlay) {
  if (overlay === els.overlay) {
    els.deny.focus();
    return;
  }
  if (overlay === els.cameraOverlay) closeCamera();
  else if (overlay === els.regionOverlay) closeRegionCapture();
  else if (overlay === els.screenshotOverlay) hideDialog(els.screenshotOverlay, els.screenshot);
  else if (overlay === els.diagnosticsOverlay) hideDialog(els.diagnosticsOverlay, els.more);
  else if (overlay === els.authOverlay) hideDialog(els.authOverlay, els.brandMenuButton);
}

function closeOnBackdropClick(event) {
  if (event.target === event.currentTarget) closeActiveModal(event.currentTarget);
}

function setBrandMenuOpen(open, { restoreFocus = false } = {}) {
  els.brandMenu.hidden = !open;
  els.brandMenuButton.setAttribute("aria-expanded", String(open));
  if (open) requestAnimationFrame(() => els.settings.focus());
  else if (restoreFocus) els.brandMenuButton.focus();
}

function applyAccessibilityPreferences(preferences) {
  if (!preferences) return;
  const reduceMotion = preferences.reduceMotion || reduceMotionQuery.matches;
  const highContrast = preferences.highContrast || highContrastQuery.matches;
  document.documentElement.classList.toggle("reduce-motion", reduceMotion);
  document.documentElement.classList.toggle("high-contrast", highContrast);
  try { api.setTextScale(preferences.textScale); }
  catch (error) { console.warn("Unable to apply text scale", error); }
}

function basename(value) { return value?.replace(/\/$/, "").split("/").pop() || "Project"; }
function relativeTime(timestamp) {
  const seconds = Math.max(0, Date.now() / 1000 - timestamp);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(timestamp * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function toast(message) {
  els.toast.textContent = message; els.toast.hidden = false; clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { els.toast.hidden = true; }, 3200);
}
function showError(error) { console.error(error); toast(error?.message || String(error)); }
function protocolFeatureAvailable(name) { return state.compatibility?.features?.[name]?.available !== false; }
function setConnection(connected, error) {
  state.connected = connected; state.connectionError = error || null; els.connectionDot.classList.toggle("connected", connected);
  if (!connected) {
    els.accountName.textContent = "Codex unavailable"; els.accountPlan.textContent = error || "Check the CLI installation";
    for (const terminal of state.terminals.tabs.filter((tab) => ["running", "starting"].includes(tab.status))) {
      terminal.status = "exited";
      appendTerminalOutput(terminal, "\n[terminal stopped because the Codex connection closed]\n");
    }
    if (state.activeTurnId) { state.activeTurnId = null; toast("The active turn stopped because Codex disconnected"); }
  }
  renderTerminal();
  updateComposer(); renderAuth();
}
function renderAccount(result) {
  const account = result?.account;
  state.account = account || null;
  if (!account) { els.accountName.textContent = "Sign in with Codex CLI"; els.accountPlan.textContent = "Run codex login"; }
  else if (account.type === "chatgpt") { els.accountName.textContent = account.email || "ChatGPT account"; els.accountPlan.textContent = `${account.planType || "ChatGPT"} plan`; }
  else if (account.type === "apiKey") { els.accountName.textContent = "OpenAI API key"; els.accountPlan.textContent = "Codex CLI authenticated"; }
  else { els.accountName.textContent = "Codex account"; els.accountPlan.textContent = account.type; }
  renderAuth(); updateComposer();
}

function renderAuth() {
  if (!els.authOverlay || els.authOverlay.hidden) return;
  const cliFound = Boolean(state.cli?.found);
  els.cliLocation.hidden = !state.cli;
  els.cliPath.textContent = state.cli?.path || "Not found";
  els.retryConnection.hidden = true; els.chooseCli.hidden = true; els.signIn.hidden = true; els.logout.hidden = true;
  if (!cliFound) {
    els.authEyebrow.textContent = "SETUP REQUIRED"; els.authTitle.textContent = "Codex CLI not found";
    els.authDescription.textContent = "The desktop app needs a Codex CLI executable. It can use a standalone installation or the copy bundled with a supported editor extension.";
    els.chooseCli.hidden = false; els.retryConnection.hidden = false;
  } else if (state.compatibility?.status === "incompatible") {
    els.authEyebrow.textContent = "PROTOCOL MISMATCH"; els.authTitle.textContent = "Update the Codex CLI";
    els.authDescription.textContent = `${state.compatibility.message} Missing: ${(state.compatibility.missingMethods || []).join(", ") || state.compatibility.missingMethod || "required app-server methods"}. Update Codex or select a newer executable.`;
    els.chooseCli.hidden = false; els.retryConnection.hidden = false;
  } else if (!state.connected) {
    els.authEyebrow.textContent = "CONNECTION ERROR"; els.authTitle.textContent = "Codex could not start";
    els.authDescription.textContent = state.connectionError || "Check the selected executable and try again.";
    els.chooseCli.hidden = false; els.retryConnection.hidden = false;
  } else if (!state.account) {
    if (!protocolFeatureAvailable("authentication")) {
      els.authEyebrow.textContent = "LIMITED PROTOCOL"; els.authTitle.textContent = "Sign-in is unavailable";
      els.authDescription.textContent = "This Codex CLI supports core threads but not the account methods required for desktop sign-in. Update Codex or authenticate with the CLI.";
      els.chooseCli.hidden = false;
    } else {
      els.authEyebrow.textContent = "CODEX ACCOUNT"; els.authTitle.textContent = state.loginPending ? "Finish signing in" : "Sign in to Codex";
      els.authDescription.textContent = state.loginPending ? "A secure ChatGPT sign-in page opened in your browser. This window will update when login finishes." : "Use your ChatGPT account through the Codex CLI. Your credentials remain managed by Codex.";
      els.signIn.hidden = state.loginPending; els.chooseCli.hidden = false;
    }
  } else {
    els.authEyebrow.textContent = "CONNECTED"; els.authTitle.textContent = state.account.email || (state.account.type === "apiKey" ? "OpenAI API key" : "ChatGPT account");
    els.authDescription.textContent = state.account.type === "chatgpt" ? `${state.account.planType || "ChatGPT"} plan · Ready for Codex threads.` : "The Codex CLI is authenticated and ready.";
    els.logout.hidden = false; els.chooseCli.hidden = false;
  }
  renderDesktopPreferences();
}

function renderDesktopPreferences() {
  const desktop = state.desktop;
  if (!desktop) return;
  const preferences = desktop.preferences;
  els.shortcutSelect.value = preferences.quickPromptShortcut || "";
  els.trayEnabled.checked = preferences.trayEnabled;
  els.closeToTray.checked = preferences.closeToTray;
  els.closeToTray.disabled = !preferences.trayEnabled;
  els.launchAtLogin.checked = Boolean(desktop.autostart?.enabled);
  els.launchAtLogin.disabled = !desktop.autostart?.available || desktop.autostart?.conflict;
  els.notifyTurnComplete.checked = preferences.notifyTurnComplete;
  els.notifyApproval.checked = preferences.notifyApproval;
  els.notifyTerminal.checked = preferences.notifyTerminal;
  els.textScale.value = String(preferences.textScale);
  els.reduceMotion.checked = preferences.reduceMotion;
  els.highContrast.checked = preferences.highContrast;
  applyAccessibilityPreferences(preferences);
  for (const input of [els.notifyTurnComplete, els.notifyApproval, els.notifyTerminal]) input.disabled = !desktop.notifications?.supported;
  els.shortcutPreferenceStatus.className = "setting-status";
  if (!preferences.quickPromptShortcut) els.shortcutPreferenceStatus.textContent = "Global quick prompt is disabled.";
  else if (desktop.shortcut.registered) {
    els.shortcutPreferenceStatus.classList.add("good");
    els.shortcutPreferenceStatus.textContent = desktop.shortcut.accelerator === desktop.shortcut.requested
      ? `${desktop.shortcut.accelerator} is active.`
      : `${desktop.shortcut.accelerator} is active because the preferred shortcut was unavailable.`;
  } else {
    els.shortcutPreferenceStatus.classList.add("warn");
    els.shortcutPreferenceStatus.textContent = desktop.shortcut.error || "The shortcut could not be registered. It may be reserved by another application.";
  }
  els.trayPreferenceStatus.className = "setting-status";
  if (!preferences.trayEnabled) els.trayPreferenceStatus.textContent = "The system tray is disabled.";
  else if (desktop.tray.available) {
    els.trayPreferenceStatus.classList.add("good");
    els.trayPreferenceStatus.textContent = desktop.environment.sessionType === "wayland"
      ? "Tray created. Visibility depends on your Wayland desktop’s status-notifier support."
      : "Tray is ready.";
  } else {
    els.trayPreferenceStatus.classList.add("warn");
    els.trayPreferenceStatus.textContent = desktop.tray.error || "The desktop shell did not provide a system tray.";
  }
  els.autostartPreferenceStatus.className = "setting-status";
  if (!desktop.autostart?.available) {
    els.autostartPreferenceStatus.textContent = desktop.autostart?.reason || "Launch at login is unavailable in this build.";
  } else if (desktop.autostart.conflict || desktop.autostart.reason) {
    els.autostartPreferenceStatus.classList.add("warn");
    els.autostartPreferenceStatus.textContent = desktop.autostart.reason;
  } else if (desktop.autostart.enabled) {
    els.autostartPreferenceStatus.classList.add("good");
    els.autostartPreferenceStatus.textContent = desktop.autostart.testMode
      ? "Isolated test autostart is enabled."
      : "Codex will start in the background after you log in.";
  } else {
    els.autostartPreferenceStatus.textContent = desktop.autostart.testMode
      ? "Isolated test autostart is disabled."
      : "Codex will not start automatically.";
  }
  const systemModes = [
    reduceMotionQuery.matches ? "system reduced motion" : null,
    highContrastQuery.matches ? "system high contrast" : null,
  ].filter(Boolean);
  els.accessibilityPreferenceStatus.className = "setting-status";
  els.accessibilityPreferenceStatus.textContent = systemModes.length
    ? `Also active: ${systemModes.join(" and ")}.`
    : "System contrast and reduced-motion preferences are also respected.";
  els.notificationPreferenceStatus.className = "setting-status";
  if (desktop.notifications?.supported) {
    els.notificationPreferenceStatus.classList.add("good");
    els.notificationPreferenceStatus.textContent = "Desktop notifications are available and appear only while Codex is unfocused.";
  } else {
    els.notificationPreferenceStatus.classList.add("warn");
    els.notificationPreferenceStatus.textContent = desktop.notifications?.error || "This desktop session does not provide system notifications.";
  }
}

function renderUpdateState() {
  const updates = state.updates;
  if (!updates) return;
  els.updateChannel.value = updates.preferences.channel;
  els.autoCheckUpdates.checked = updates.preferences.autoCheck;
  const locked = ["downloading", "downloaded"].includes(updates.phase);
  els.updateChannel.disabled = locked || !updates.supported;
  els.autoCheckUpdates.disabled = locked || !updates.supported;
  els.checkUpdates.disabled = !updates.canCheck;
  els.downloadUpdate.hidden = !updates.canDownload;
  els.installUpdate.hidden = !updates.canInstall;
  els.updatePreferenceStatus.className = "setting-status";

  if (!updates.supported) {
    els.updatePreferenceStatus.textContent = updates.reason || "Updates are unavailable for this package.";
  } else if (updates.phase === "checking") {
    els.updatePreferenceStatus.textContent = `Checking the ${updates.preferences.channel} channel…`;
  } else if (updates.phase === "available") {
    els.updatePreferenceStatus.classList.add("good");
    els.updatePreferenceStatus.textContent = `Version ${updates.availableVersion || "new"} is available. Download it when you’re ready.`;
  } else if (updates.phase === "downloading") {
    els.updatePreferenceStatus.textContent = Number.isFinite(updates.percent)
      ? `Downloading version ${updates.availableVersion || "update"}… ${Math.round(updates.percent)}%`
      : `Downloading version ${updates.availableVersion || "update"}…`;
  } else if (updates.phase === "downloaded") {
    els.updatePreferenceStatus.classList.add("good");
    els.updatePreferenceStatus.textContent = `Version ${updates.availableVersion || "update"} is ready. Restart to install it.`;
  } else if (updates.phase === "current") {
    els.updatePreferenceStatus.classList.add("good");
    els.updatePreferenceStatus.textContent = `Version ${updates.currentVersion} is current on the ${updates.preferences.channel} channel.`;
  } else if (updates.phase === "error") {
    els.updatePreferenceStatus.classList.add("warn");
    els.updatePreferenceStatus.textContent = updates.error || "The update check failed. Try again or open the releases page.";
  } else {
    els.updatePreferenceStatus.textContent = `${updates.packageType.toUpperCase()} package · ${updates.preferences.channel} channel · version ${updates.currentVersion}.`;
  }
}

async function saveDesktopPreferences(updates) {
  try {
    state.desktop = await api.updateDesktopPreferences(updates);
    renderDesktopPreferences();
  } catch (error) { renderDesktopPreferences(); showError(error); }
}

async function saveUpdatePreferences(changes) {
  if (!state.updates) return;
  try {
    state.updates = await api.setUpdatePreferences({ ...state.updates.preferences, ...changes });
    renderUpdateState();
  } catch (error) { renderUpdateState(); showError(error); }
}

async function runUpdateAction(action) {
  try {
    if (action === "check") state.updates = await api.checkForUpdates();
    else if (action === "download") state.updates = await api.downloadUpdate();
    else if (action === "install") { await api.installUpdate(); return; }
    renderUpdateState();
  } catch (error) { showError(error); }
}

async function openAuth() {
  setBrandMenuOpen(false);
  showDialog(els.authOverlay, els.closeAuth);
  try { state.cli = await api.cliStatus(); } catch (error) { state.connectionError = error.message; }
  try { state.desktop = await api.desktopPreferences(); } catch (error) { console.warn("Unable to read desktop preferences", error); }
  try { state.updates = await api.updateState(); } catch (error) { console.warn("Unable to read update state", error); }
  renderAuth();
  renderUpdateState();
}
function diagnosticPill(label, condition) { const pill = document.createElement("span"); pill.className = `diagnostics-pill ${condition === "warn" ? "warn" : condition ? "good" : "bad"}`; pill.textContent = label; return pill; }
async function openDiagnostics() {
  showDialog(els.diagnosticsOverlay, els.closeDiagnostics); els.diagnosticsContent.textContent = "Collecting diagnostics…"; els.diagnosticsStatus.replaceChildren();
  try {
    const report = await api.diagnostics(); state.compatibility = report.codex.compatibility;
    els.diagnosticsStatus.append(
      diagnosticPill(`Codex ${report.codex.found ? "found" : "missing"}`, report.codex.found),
      diagnosticPill(report.codex.connected ? "Connected" : "Disconnected", report.codex.connected),
      diagnosticPill(`Protocol ${report.codex.compatibility.status}`, report.codex.compatibility.status === "compatible" ? true : report.codex.compatibility.status === "partial" || report.codex.compatibility.status === "unknown" ? "warn" : false),
      diagnosticPill(report.quickPrompt.registered ? "Shortcut ready" : report.quickPrompt.requested ? "Shortcut unavailable" : "Shortcut disabled", report.quickPrompt.registered ? true : report.quickPrompt.requested ? false : "warn"),
      diagnosticPill(report.tray.available ? "Tray ready" : report.tray.enabled ? "Tray unavailable" : "Tray disabled", report.tray.available ? true : report.tray.enabled ? false : "warn"),
      diagnosticPill(report.autostart.enabled ? "Login startup enabled" : report.autostart.conflict ? "Login startup conflict" : report.autostart.available ? "Login startup disabled" : "Login startup unavailable", report.autostart.enabled ? true : report.autostart.conflict ? false : "warn"),
      diagnosticPill(report.deepLinks.singleInstance ? "Deep links ready" : "Deep links unavailable", report.deepLinks.singleInstance),
      diagnosticPill(report.updates.supported ? `Updates ${report.updates.phase}` : `${report.updates.packageType} updates external`, report.updates.supported ? (report.updates.phase === "error" ? false : true) : "warn"),
      diagnosticPill(report.notifications.supported ? "Notifications ready" : "Notifications unavailable", report.notifications.supported),
    );
    els.diagnosticsContent.textContent = JSON.stringify(report, null, 2);
  } catch (error) { els.diagnosticsContent.textContent = error.message; }
}
function renderModels() {
  const selected = els.model.value; els.model.replaceChildren(new Option("Default model", ""));
  for (const model of state.models.filter((entry) => !entry.hidden)) els.model.add(new Option(model.displayName + (model.isDefault ? " · default" : ""), model.model));
  els.model.value = state.models.some((model) => model.model === selected) ? selected : "";
}
function renderThreads() {
  const query = els.threadSearch.value.trim().toLowerCase();
  const threads = state.threads.filter((thread) => `${thread.name || ""} ${thread.preview || ""} ${thread.cwd || ""}`.toLowerCase().includes(query));
  els.threadList.replaceChildren();
  if (!threads.length) { const empty = document.createElement("p"); empty.className = "empty-list"; empty.textContent = query ? "No matching threads" : "No Codex threads yet"; els.threadList.append(empty); return; }
  for (const thread of threads) {
    const button = document.createElement("button"); button.className = `thread-item${thread.id === state.activeThread?.id ? " active" : ""}`;
    const title = document.createElement("strong"); title.textContent = thread.name || thread.preview || "Untitled thread";
    const time = document.createElement("time"); time.textContent = relativeTime(thread.updatedAt);
    const project = document.createElement("small"); project.textContent = basename(thread.cwd);
    button.title = `${title.textContent} · ${project.textContent}`;
    if (thread.id === state.activeThread?.id) button.setAttribute("aria-current", "page");
    button.append(title, time, project); button.addEventListener("click", () => resumeThread(thread.id)); els.threadList.append(button);
  }
}
function setActiveThread(thread, turns = []) {
  state.activeThread = thread; state.turns = turns; state.activeTurnId = turns.findLast?.((turn) => turn.status === "inProgress")?.id || null; state.diff = ""; state.gitSelection = null; state.gitFileDiff = "";
  els.threadTitle.textContent = thread.name || thread.preview || "New thread"; els.projectPath.textContent = thread.cwd; els.folderName.textContent = basename(thread.cwd);
  els.home.disabled = false; els.welcome.hidden = true; els.messages.hidden = false; els.terminalButton.disabled = !protocolFeatureAvailable("terminal"); renderThreads(); renderMessages(); renderDiff(); updateComposer(); refreshGit();
  if (terminalPanelVisible()) focusProjectTerminal({ create: true });
  else renderTerminal();
}

async function showHome() {
  try { await api.showHome(); }
  catch (error) { showError(error); return; }
  state.activeThread = null; state.turns = []; state.activeTurnId = null; state.diff = ""; state.git = null; state.gitDiffs = { working: "", staged: "" }; state.gitSelection = null; state.gitFileDiff = ""; state.attachments = [];
  els.threadTitle.textContent = "New thread"; els.projectPath.textContent = "Choose a project to begin"; els.folderName.textContent = "Project";
  els.home.disabled = true; els.welcome.hidden = false; els.messages.hidden = true; els.messages.replaceChildren(); els.gitBranch.hidden = true; els.terminalButton.disabled = true;
  closeDiffPanel({ restoreFocus: false });
  closeTerminalPanel({ restoreFocus: false });
  renderAttachments(); renderThreads(); renderDiff(); renderTerminal(); updateComposer();
  els.conversation.scrollTop = 0;
  els.openProject.focus();
}
function createMessage(content, className) {
  const node = document.createElement("div"); node.className = `message ${className}`;
  if (className === "agent" && window.RichText) {
    node.innerHTML = window.RichText.render(content);
    window.RichText.highlight(node);
    for (const link of node.querySelectorAll("a")) link.addEventListener("click", (event) => { event.preventDefault(); try { const url = new URL(link.href); if (url.protocol === "https:") api.openExternal(url.toString()); } catch {} });
    for (const pre of node.querySelectorAll("pre")) {
      const copy = document.createElement("button"); copy.className = "code-copy"; copy.textContent = "Copy";
      copy.addEventListener("click", async () => { await navigator.clipboard.writeText(pre.textContent); copy.textContent = "Copied"; setTimeout(() => { copy.textContent = "Copy"; }, 1200); });
      pre.append(copy);
    }
  } else node.textContent = content;
  return node;
}
function userInputText(content = []) { return content.filter((item) => item.type === "text").map((item) => item.text).join("\n"); }
function toolNode(label, output, status) {
  const details = document.createElement("details"); details.className = "tool-card";
  const summary = document.createElement("summary"), name = document.createElement("span"), stateNode = document.createElement("span"), pre = document.createElement("pre");
  name.textContent = label.length > 110 ? `${label.slice(0, 107)}…` : label; stateNode.className = `tool-status ${status || ""}`; stateNode.textContent = status || "working"; pre.textContent = output;
  summary.append(name, stateNode); details.append(summary, pre); return details;
}
function itemNode(item) {
  if (item.type === "userMessage") {
    const labels = (item.content || []).filter((entry) => entry.type !== "text").map((entry) => entry.name || basename(entry.path) || (entry.type === "localImage" ? "Image" : "Attachment"));
    return createMessage([userInputText(item.content), labels.length ? `📎 ${labels.join(", ")}` : ""].filter(Boolean).join("\n\n"), "user");
  }
  if (item.type === "agentMessage") return createMessage(item.text || "", "agent");
  if (item.type === "reasoning" || item.type === "plan") { const node = document.createElement("div"); node.className = "reasoning"; node.textContent = item.type === "plan" ? item.text : [...(item.summary || []), ...(item.content || [])].join("\n"); return node; }
  if (item.type === "commandExecution") return toolNode(`Terminal · ${item.command}`, item.aggregatedOutput || "Waiting for output…", item.status);
  if (item.type === "fileChange") return toolNode(`Files · ${(item.changes || []).length} changed`, (item.changes || []).map((change) => change.path || JSON.stringify(change)).join("\n") || "Preparing changes…", item.status);
  if (item.type === "mcpToolCall") return toolNode(`${item.server} · ${item.tool}`, JSON.stringify(item.result || item.arguments, null, 2), item.status);
  if (item.type === "dynamicToolCall") return toolNode(`${item.namespace ? `${item.namespace} · ` : ""}${item.tool}`, JSON.stringify(item.contentItems || item.arguments, null, 2), item.status);
  if (item.type === "webSearch") return toolNode("Web search", item.query || "Searching the web…", item.status || "completed");
  if (item.type === "contextCompaction") return toolNode("Context compacted", "Codex condensed the conversation context.", "completed");
  return toolNode(item.type, JSON.stringify(item, null, 2), item.status || "completed");
}
function renderMessages() {
  els.messages.replaceChildren();
  for (const turn of state.turns) {
    const turnNode = document.createElement("section"); turnNode.className = "turn"; turnNode.dataset.turnId = turn.id;
    for (const item of turn.items || []) turnNode.append(itemNode(item));
    if (turn.error) { const error = document.createElement("div"); error.className = "turn-error"; error.textContent = turn.error.message || JSON.stringify(turn.error); turnNode.append(error); }
    else if (turn.status === "inProgress" && !(turn.items || []).some((item) => item.type === "agentMessage" && item.text)) { const thinking = document.createElement("div"); thinking.className = "thinking"; thinking.innerHTML = "<i></i><i></i><i></i>"; turnNode.append(thinking); }
    els.messages.append(turnNode);
  }
  requestAnimationFrame(() => { els.conversation.scrollTop = els.conversation.scrollHeight; });
}
function ensureTurn(turnId) { let turn = state.turns.find((entry) => entry.id === turnId); if (!turn) { turn = { id: turnId, items: [], status: "inProgress", error: null }; state.turns.push(turn); } return turn; }
function upsertItem(turnId, item) { const turn = ensureTurn(turnId), index = turn.items.findIndex((entry) => entry.id === item.id); if (index === -1) turn.items.push(item); else turn.items[index] = item; }
function appendItemDelta(turnId, itemId, type, field, delta) {
  const turn = ensureTurn(turnId); let item = turn.items.find((entry) => entry.id === itemId);
  if (!item) { item = type === "agentMessage" ? { type, id: itemId, text: "", phase: null, memoryCitation: null } : { type, id: itemId, aggregatedOutput: "", status: "inProgress", command: "Command", cwd: "", commandActions: [], processId: null, source: "agent" }; turn.items.push(item); }
  item[field] = `${item[field] || ""}${delta}`;
}
function diffForView() { return state.diffView === "turn" ? state.diff : state.gitDiffs[state.diffView]; }
function gitFilesForView() {
  if (state.diffView === "turn") return [...new Set([...state.diff.matchAll(/^diff --git a\/(.+?) b\//gm)].map((match) => match[1]))].map((path) => ({ path, index: "·", worktree: "·" }));
  return (state.git?.entries || []).filter((entry) => state.diffView === "staged" ? entry.staged : entry.unstaged);
}
function gitCode(entry) {
  if (entry.untracked) return "??";
  return state.diffView === "staged" ? `${entry.index} ` : ` ${entry.worktree}`;
}
function renderDiff() {
  const files = gitFilesForView();
  if (state.gitSelection && !files.some((entry) => entry.path === state.gitSelection)) { state.gitSelection = null; state.gitFileDiff = ""; }
  const current = state.gitSelection ? state.gitFileDiff : (diffForView() || "");
  els.diffContent.textContent = current || (state.diffView === "turn" ? "No changes in the current turn." : `No ${state.diffView} changes.`);
  const changedCount = state.git?.entries?.length || [...state.diff.matchAll(/^diff --git /gm)].length;
  els.diffBadge.textContent = changedCount; els.diffSummary.textContent = `${state.git?.branch || "Repository"} · ${changedCount} change${changedCount === 1 ? "" : "s"}`;
  els.diffButton.disabled = !state.activeThread;
  for (const tab of document.querySelectorAll("[data-diff-view]")) {
    const active = tab.dataset.diffView === state.diffView;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const tab of document.querySelectorAll("[data-diff-view='turn']")) { tab.disabled = !protocolFeatureAvailable("changeStreaming"); tab.title = tab.disabled ? "Update Codex to enable current-turn diff streaming" : ""; }
  els.diffFiles.replaceChildren();
  for (const entry of files) {
    const button = document.createElement("button"); button.classList.toggle("active", entry.path === state.gitSelection); button.title = entry.originalPath ? `${entry.originalPath} → ${entry.path}` : entry.path;
    const code = document.createElement("span"), label = document.createElement("span"); code.className = "git-file-code"; code.textContent = gitCode(entry); label.textContent = entry.path; button.append(code, label);
    button.addEventListener("click", () => selectGitFile(entry.path)); els.diffFiles.append(button);
  }
  const selectedEntry = files.find((entry) => entry.path === state.gitSelection);
  els.gitSelection.textContent = selectedEntry?.path || (files.length ? `${files.length} changed file${files.length === 1 ? "" : "s"}` : "No files in this view");
  els.gitPrimary.hidden = !selectedEntry || state.diffView === "turn"; els.gitDiscard.hidden = !selectedEntry || state.diffView !== "working";
  if (state.diffView === "working") els.gitPrimary.textContent = "Stage file";
  else if (state.diffView === "staged") els.gitPrimary.textContent = "Unstage file";
  const stagedCount = (state.git?.entries || []).filter((entry) => entry.staged).length;
  els.gitCommitButton.disabled = !stagedCount || !els.gitCommitMessage.value.trim();
}
async function selectGitFile(file) {
  state.gitSelection = file; state.gitFileDiff = "Loading diff…"; renderDiff();
  try {
    state.gitFileDiff = state.diffView === "turn" ? (diffForView().split(/(?=^diff --git )/m).find((part) => part.startsWith(`diff --git a/${file} b/`)) || "") : await api.gitDiff({ cwd: state.activeThread.cwd, staged: state.diffView === "staged", file });
  } catch (error) { state.gitFileDiff = `Unable to load this diff: ${error.message}`; }
  renderDiff();
}
async function refreshGit() {
  if (!state.activeThread) return;
  try {
    const [git, working, staged] = await Promise.all([api.gitStatus(state.activeThread.cwd), api.gitDiff({ cwd: state.activeThread.cwd, staged: false }), api.gitDiff({ cwd: state.activeThread.cwd, staged: true })]);
    state.git = git; state.gitDiffs = { working, staged }; els.gitBranch.hidden = false;
    els.gitBranch.textContent = `⑂ ${git.branch}${git.ahead || git.behind ? ` ↑${git.ahead} ↓${git.behind}` : ""}`; renderDiff();
    const first = gitFilesForView()[0]; if (!state.gitSelection && first) await selectGitFile(first.path);
  } catch {
    state.git = null; state.gitDiffs = { working: "", staged: "" }; state.gitSelection = null; state.gitFileDiff = ""; els.gitBranch.hidden = true; renderDiff();
  }
}
async function runGitAction(action) {
  if (!state.gitSelection || !state.activeThread) return;
  const entry = (state.git?.entries || []).find((candidate) => candidate.path === state.gitSelection);
  const params = { cwd: state.activeThread.cwd, paths: [state.gitSelection, entry?.originalPath].filter(Boolean) };
  try {
    if (action === "stage") await api.gitStage(params);
    else if (action === "unstage") await api.gitUnstage(params);
    else if (action === "discard") {
      const result = await api.gitDiscard(params); if (result.cancelled) return;
    }
    state.gitSelection = null; state.gitFileDiff = ""; await refreshGit(); toast(action === "discard" ? "Working changes discarded" : `File ${action}d`);
  } catch (error) { showError(error); }
}
async function commitStaged() {
  const message = els.gitCommitMessage.value.trim();
  if (!message || !state.activeThread) return;
  try { const result = await api.gitCommit({ cwd: state.activeThread.cwd, message }); if (result.cancelled) return; els.gitCommitMessage.value = ""; state.gitSelection = null; await refreshGit(); toast(result.output?.split("\n")[0] || "Commit created"); }
  catch (error) { showError(error); }
}
function updateComposer() {
  const canType = state.connected && Boolean(state.account) && Boolean(state.activeThread) && !state.activeTurnId;
  els.prompt.disabled = !canType; els.send.disabled = !canType || (!els.prompt.value.trim() && !state.attachments.length); els.send.hidden = Boolean(state.activeTurnId); els.stop.hidden = !state.activeTurnId;
}

function formatBytes(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function addAttachments(items) {
  const known = new Set(state.attachments.map((item) => item.path));
  for (const item of items || []) if (!known.has(item.path) && state.attachments.length < 20) { state.attachments.push(item); known.add(item.path); }
  renderAttachments(); updateComposer();
}
function renderAttachments() {
  els.attachmentTray.hidden = !state.attachments.length; els.attachmentTray.replaceChildren();
  state.attachments.forEach((attachment, index) => {
    const chip = document.createElement("div"); chip.className = "attachment-chip";
    let preview;
    if (attachment.preview) { preview = document.createElement("img"); preview.src = attachment.preview; preview.alt = ""; }
    else { preview = document.createElement("span"); preview.className = "attachment-icon"; preview.textContent = attachment.kind === "image" ? "▧" : "≡"; }
    const label = document.createElement("div"), name = document.createElement("strong"), size = document.createElement("small"), remove = document.createElement("button");
    name.textContent = attachment.name; size.textContent = formatBytes(attachment.size); remove.textContent = "×"; remove.title = "Remove attachment";
    remove.addEventListener("click", () => { state.attachments.splice(index, 1); renderAttachments(); updateComposer(); });
    label.append(name, size); chip.append(preview, label, remove); els.attachmentTray.append(chip);
  });
}

async function chooseAttachments() { try { addAttachments(await api.chooseAttachments()); } catch (error) { showError(error); } }

function stopCameraStream() {
  for (const track of cameraCapture.stream?.getTracks?.() || []) track.stop();
  cameraCapture.stream = null;
  els.cameraVideo.srcObject = null;
}

function setCameraPreviewState(message, { error = false, live = false } = {}) {
  els.cameraPreviewState.hidden = live;
  els.cameraPreviewState.classList.toggle("error", error);
  els.cameraPreviewState.textContent = message;
}

function cameraErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") return "Camera access was denied. Allow camera access for Codex Linux, then try again.";
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") return "No camera was found on this computer.";
  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") return "The camera is busy or unavailable. Close other camera apps and try again.";
  if (error?.name === "OverconstrainedError") return "The selected camera is no longer available.";
  return error?.message || "Unable to open the camera.";
}

function populateCameraDevices(devices, selectedId) {
  cameraCapture.devices = devices;
  els.cameraDevice.replaceChildren();
  devices.forEach((device, index) => els.cameraDevice.add(new Option(device.label || `Camera ${index + 1}`, device.deviceId)));
  if (selectedId && devices.some((device) => device.deviceId === selectedId)) els.cameraDevice.value = selectedId;
  els.cameraDeviceField.hidden = devices.length < 2;
}

function handleCameraFailure(error) {
  console.error(error);
  stopCameraStream();
  els.captureCamera.disabled = true;
  els.cameraResolution.textContent = "Camera unavailable";
  setCameraPreviewState(cameraErrorMessage(error), { error: true });
}

async function startCamera(deviceId = null) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera capture is not supported by this desktop runtime.");
  const requestId = ++cameraCapture.requestId;
  stopCameraStream();
  els.captureCamera.disabled = true;
  els.cameraResolution.textContent = "Waiting for video…";
  setCameraPreviewState(deviceId ? "Switching cameras…" : "Requesting camera access…");
  const video = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
  if (requestId !== cameraCapture.requestId || els.cameraOverlay.hidden) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }
  cameraCapture.stream = stream;
  els.cameraVideo.srcObject = stream;
  await els.cameraVideo.play();
  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings?.() || {};
  let devices = [];
  try { devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput"); }
  catch (error) { console.warn("Unable to list cameras", error); }
  if (requestId !== cameraCapture.requestId) return;
  populateCameraDevices(devices, settings.deviceId || deviceId);
  els.cameraResolution.textContent = `${els.cameraVideo.videoWidth || settings.width || "—"} × ${els.cameraVideo.videoHeight || settings.height || "—"}`;
  els.captureCamera.disabled = !els.cameraVideo.videoWidth || !els.cameraVideo.videoHeight;
  setCameraPreviewState("", { live: true });
  track?.addEventListener("ended", () => {
    if (cameraCapture.stream !== stream || els.cameraOverlay.hidden) return;
    handleCameraFailure(new DOMException("The camera was disconnected.", "NotReadableError"));
  }, { once: true });
}

function closeCamera() {
  cameraCapture.requestId += 1;
  stopCameraStream();
  cameraCapture.devices = [];
  hideDialog(els.cameraOverlay, els.camera);
  els.cameraDevice.replaceChildren();
  els.cameraDeviceField.hidden = true;
  els.captureCamera.disabled = true;
}

function openCamera() {
  closeRegionCapture();
  hideDialog(els.screenshotOverlay, els.camera);
  showDialog(els.cameraOverlay, els.cancelCamera);
  els.cameraDescription.textContent = "Camera video stays on this device. Only the still image you capture is attached.";
  startCamera().catch((error) => {
    if (!els.cameraOverlay.hidden) handleCameraFailure(error);
  });
}

async function captureCameraFrame() {
  const width = els.cameraVideo.videoWidth;
  const height = els.cameraVideo.videoHeight;
  if (!cameraCapture.stream || !width || !height) return;
  const scale = Math.min(1, 2560 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Unable to prepare the camera image");
  context.drawImage(els.cameraVideo, 0, 0, canvas.width, canvas.height);
  els.captureCamera.disabled = true;
  els.cameraResolution.textContent = "Attaching photo…";
  try {
    addAttachments([await api.saveCameraFrame(canvas.toDataURL("image/png"))]);
    closeCamera();
  } catch (error) {
    els.captureCamera.disabled = false;
    els.cameraResolution.textContent = `${width} × ${height}`;
    throw error;
  }
}

function imageCropForSelection() {
  if (!regionCapture.selection || !els.regionImage.naturalWidth || !els.regionImage.naturalHeight) return null;
  const displayed = els.regionCanvas.getBoundingClientRect();
  return selectionToImage(
    regionCapture.selection,
    { width: displayed.width, height: displayed.height },
    { width: els.regionImage.naturalWidth, height: els.regionImage.naturalHeight },
  );
}

function renderRegionSelection() {
  const selection = regionCapture.selection;
  els.regionSelection.hidden = !selection;
  if (!selection) {
    els.captureRegion.disabled = true;
    els.regionStatus.textContent = "Drag on the image, or use the arrow keys, to select a region.";
    return;
  }
  Object.assign(els.regionSelection.style, {
    left: `${selection.x}px`,
    top: `${selection.y}px`,
    width: `${selection.width}px`,
    height: `${selection.height}px`,
  });
  try {
    const crop = imageCropForSelection();
    const valid = crop.width >= 4 && crop.height >= 4;
    els.captureRegion.disabled = !valid;
    els.regionStatus.textContent = valid ? `${crop.width} × ${crop.height} pixels selected` : "Drag a larger region.";
  } catch {
    els.captureRegion.disabled = true;
    els.regionStatus.textContent = "Drag a larger region.";
  }
}

function closeRegionCapture() {
  hideDialog(els.regionOverlay, els.screenshot);
  regionCapture.source = null;
  regionCapture.start = null;
  regionCapture.selection = null;
  regionCapture.dragging = false;
  els.regionImage.removeAttribute("src");
  els.regionSelection.hidden = true;
  els.captureRegion.disabled = true;
}

function startRegionCapture(source) {
  regionCapture.source = source;
  regionCapture.start = null;
  regionCapture.selection = null;
  regionCapture.dragging = false;
  hideDialog(els.screenshotOverlay, els.screenshot);
  els.regionTitle.textContent = `Select part of ${source.name}`;
  els.regionImage.alt = `Captured preview of ${source.name}`;
  els.regionImage.src = source.thumbnail;
  showDialog(els.regionOverlay, els.closeRegion);
  renderRegionSelection();
}

function regionPoint(event) {
  const bounds = els.regionCanvas.getBoundingClientRect();
  return {
    point: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
    bounds: { width: bounds.width, height: bounds.height },
  };
}

function updateRegionDrag(event) {
  if (!regionCapture.dragging || !regionCapture.start) return;
  const { point, bounds } = regionPoint(event);
  regionCapture.selection = selectionFromPoints(regionCapture.start, point, bounds);
  renderRegionSelection();
}

async function showCaptureSources() {
  closeRegionCapture();
  showDialog(els.screenshotOverlay, els.closeCapture); els.captureHint.textContent = "Capture the full source, or select just the part you need."; els.captureSources.textContent = "Loading screens and windows…";
  try {
    const sources = await api.captureSources(); els.captureSources.replaceChildren();
    if (!sources.length) {
      els.captureSources.textContent = "No screens or windows are available to capture.";
      return;
    }
    if (sources.some((source) => source.wayland)) els.captureHint.textContent = "Your desktop may ask which source to share. Capture it in full or select a region below.";
    for (const source of sources) {
      const card = document.createElement("article"); card.className = "capture-source";
      const image = document.createElement("img"); image.src = source.thumbnail; image.alt = "";
      const label = document.createElement("span"); label.textContent = source.name; label.title = source.name;
      const actions = document.createElement("div"); actions.className = "capture-source-actions";
      const full = document.createElement("button"); full.textContent = "Capture full";
      const region = document.createElement("button"); region.className = "capture-region-action"; region.textContent = "Select region";
      full.addEventListener("click", async () => {
        full.disabled = true;
        try { addAttachments([await api.captureSource(source.id)]); hideDialog(els.screenshotOverlay, els.screenshot); }
        catch (error) { full.disabled = false; showError(error); }
      });
      region.addEventListener("click", () => startRegionCapture(source));
      actions.append(full, region); card.append(image, label, actions); els.captureSources.append(card);
    }
  } catch (error) { showError(error); hideDialog(els.screenshotOverlay, els.screenshot); }
}

async function chooseAndStartThread(initialPrompt = "") {
  if (!state.connected || !state.account) { await openAuth(); return; }
  const cwd = await api.chooseFolder(); if (!cwd) return;
  const response = await api.startThread({ cwd, model: els.model.value, approvalPolicy: "on-request", sandbox: "workspace-write" }); setActiveThread(response.thread, response.thread.turns || []);
  if (initialPrompt) { els.prompt.value = initialPrompt; updateComposer(); await sendTurn(); } else els.prompt.focus(); await refreshThreads();
}
async function resumeThread(threadId) { try { const response = await api.resumeThread(threadId); setActiveThread(response.thread, response.thread.turns || []); } catch (error) { showError(error); } }
async function refreshThreads() { try { const response = await api.listThreads({}); state.threads = response.data; renderThreads(); } catch (error) { showError(error); } }
async function sendTurn() {
  const text = els.prompt.value.trim(), attachments = [...state.attachments]; if ((!text && !attachments.length) || !state.activeThread || state.activeTurnId) return;
  els.prompt.value = ""; state.attachments = []; renderAttachments(); els.prompt.style.height = "auto"; updateComposer();
  try {
    const response = await api.sendTurn({ threadId: state.activeThread.id, text, attachments, model: els.model.value, effort: els.effort.value }); const turn = response.turn;
    if (!(turn.items || []).some((item) => item.type === "userMessage")) turn.items = [{ type: "userMessage", id: `local-${Date.now()}`, clientId: null, content: [...(text ? [{ type: "text", text, text_elements: [] }] : []), ...attachments.map((item) => item.kind === "image" ? { type: "localImage", path: item.path } : { type: "mention", name: item.name, path: item.path })] }, ...(turn.items || [])];
    const index = state.turns.findIndex((entry) => entry.id === turn.id); if (index === -1) state.turns.push(turn); else state.turns[index] = turn;
    state.activeTurnId = turn.id; renderMessages(); updateComposer();
  } catch (error) { showError(error); state.activeTurnId = null; els.prompt.value = text; state.attachments = attachments; renderAttachments(); updateComposer(); }
}
function decodeBase64(value) { const binary = atob(value || ""); return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))); }
function terminalPanelVisible() { return els.terminalPanel.classList.contains("open"); }
function closeTerminalPanel({ restoreFocus = true } = {}) {
  if (!terminalPanelVisible()) return;
  els.terminalPanel.classList.remove("open");
  els.terminalPanel.setAttribute("aria-hidden", "true");
  if (restoreFocus) els.terminalButton.focus();
}
function closeDiffPanel({ restoreFocus = true } = {}) {
  if (!els.diffPanel.classList.contains("open")) return;
  els.diffPanel.classList.remove("open");
  els.diffPanel.setAttribute("aria-hidden", "true");
  if (restoreFocus) els.diffButton.focus();
}
function renderTerminal() {
  const terminal = activeTerminal(state.terminals);
  els.terminalTabs.replaceChildren();
  for (const tab of state.terminals.tabs) {
    const item = document.createElement("div"); item.className = `terminal-tab${tab.id === state.terminals.activeId ? " active" : ""}`;
    const active = tab.id === state.terminals.activeId;
    const select = document.createElement("button"); select.className = "terminal-tab-select"; select.title = `${tab.title} · ${tab.status} · ${tab.cwd}`; select.setAttribute("role", "tab"); select.setAttribute("aria-controls", "terminalOutput"); select.setAttribute("aria-selected", String(active)); select.tabIndex = active ? 0 : -1;
    const dot = document.createElement("span"); dot.className = `terminal-tab-dot ${tab.status}${tab.unread ? " unread" : ""}`;
    const title = document.createElement("span"); title.textContent = tab.title;
    const status = document.createElement("span"); status.className = "terminal-tab-state"; status.textContent = tab.unread ? "new output" : tab.status;
    const close = document.createElement("button"); close.className = "terminal-tab-close"; close.title = `Close ${tab.title}`; close.setAttribute("aria-label", `Close ${tab.title}`); close.textContent = "×";
    select.append(dot, title, status);
    select.addEventListener("click", () => { activateTerminal(state.terminals, tab.id); renderTerminal(); if (tab.status === "running") els.terminalInput.focus(); });
    close.addEventListener("click", () => closeTerminalTab(tab.id).catch(showError));
    item.append(select, close); els.terminalTabs.append(item);
  }

  const running = runningTerminalCount(state.terminals), unread = unreadTerminalCount(state.terminals);
  els.terminalBadge.hidden = !running && !unread;
  els.terminalBadge.textContent = running ? String(running) : "•";
  els.terminalButton.classList.toggle("attention", unread > 0);
  els.terminalButton.title = running || unread ? `${running} running terminal${running === 1 ? "" : "s"}${unread ? ` · ${unread} with new output` : ""}` : "Open terminal";

  els.terminalTitle.textContent = terminal ? `${terminal.title} · ${basename(terminal.cwd)}` : "Project terminal";
  els.terminalStatus.textContent = terminal ? `${terminal.command || "shell"} · ${terminal.status}${terminal.exitCode == null ? "" : ` (${terminal.exitCode})`}` : "No terminal tabs";
  els.terminalOutput.textContent = terminal?.output || "Open a new terminal tab to start a project shell.";
  const writable = terminal?.status === "running";
  els.terminalInput.disabled = !writable; els.terminalForm.querySelector("button").disabled = !writable;
  els.restartTerminal.disabled = !terminal || terminal.status === "starting";
  els.newTerminal.disabled = !state.activeThread || !state.connected || !protocolFeatureAvailable("terminal");
  requestAnimationFrame(() => { els.terminalOutput.scrollTop = els.terminalOutput.scrollHeight; });
}
async function startTerminal(existing = null) {
  const cwd = existing?.cwd || state.activeThread?.cwd;
  if (!cwd) return;
  const terminal = existing || createTerminalTab(state.terminals, { cwd });
  if (existing?.handle && ["running", "starting"].includes(existing.status)) {
    existing.expectedExit = true;
    try { await api.killTerminal(existing.handle); } catch {}
  }
  Object.assign(terminal, { cwd, handle: null, command: null, output: "Starting project shell…\n", status: "starting", exitCode: null, unread: false, expectedExit: false });
  activateTerminal(state.terminals, terminal.id); renderTerminal();
  try {
    const response = await api.startTerminal({ cwd, cols: 110, rows: 28 });
    if (!state.terminals.tabs.includes(terminal)) {
      try { await api.killTerminal(response.processHandle); } catch {}
      return;
    }
    Object.assign(terminal, { handle: response.processHandle, command: response.command, output: "", status: "running", exitCode: null });
    renderTerminal(); els.terminalInput.focus();
  } catch (error) {
    terminal.status = "error";
    appendTerminalOutput(terminal, `\n[terminal failed to start: ${error.message}]\n`, { visible: terminalPanelVisible() });
    renderTerminal();
    api.notifyTerminal({ processHandle: `start:${terminal.id}`, terminalId: terminal.id, exitCode: null, failedToStart: true }).catch(() => {});
    throw error;
  }
}
async function closeTerminalTab(id) {
  const terminal = state.terminals.tabs.find((tab) => tab.id === id);
  if (!terminal) return;
  if (terminal.handle && ["running", "starting"].includes(terminal.status)) {
    terminal.expectedExit = true;
    try { await api.killTerminal(terminal.handle); } catch (error) { console.warn("Unable to stop terminal while closing its tab", error); }
  }
  removeTerminal(state.terminals, id); renderTerminal();
}
function restartActiveTerminal() {
  const terminal = activeTerminal(state.terminals);
  if (terminal) startTerminal(terminal).catch(showError);
}
function focusProjectTerminal({ create = false } = {}) {
  const projectTerminal = [...state.terminals.tabs].reverse().find((tab) => tab.cwd === state.activeThread?.cwd);
  if (projectTerminal) {
    activateTerminal(state.terminals, projectTerminal.id); renderTerminal();
    if (projectTerminal.status === "running") els.terminalInput.focus();
  } else if (create) startTerminal().catch(showError);
  else renderTerminal();
}
function openTerminal() {
  if (!state.activeThread) return;
  if (!protocolFeatureAvailable("terminal")) { toast("This Codex CLI does not support project terminals. Update Codex to enable them."); return; }
  els.terminalPanel.classList.add("open"); els.terminalPanel.setAttribute("aria-hidden", "false");
  focusProjectTerminal({ create: true });
}
function handleNotification(method, params) {
  if (params.threadId && params.threadId !== state.activeThread?.id) { if (["thread/name/updated", "thread/status/changed", "turn/completed"].includes(method)) refreshThreads(); return; }
  if (method === "turn/started") { state.activeTurnId = params.turn.id; const index = state.turns.findIndex((turn) => turn.id === params.turn.id); if (index === -1) state.turns.push(params.turn); else state.turns[index] = params.turn; }
  else if (method === "item/started" || method === "item/completed") upsertItem(params.turnId, params.item);
  else if (method === "item/agentMessage/delta") appendItemDelta(params.turnId, params.itemId, "agentMessage", "text", params.delta);
  else if (method === "item/commandExecution/outputDelta" || method === "command/exec/outputDelta") appendItemDelta(params.turnId, params.itemId, "commandExecution", "aggregatedOutput", params.delta);
  else if (method === "item/fileChange/patchUpdated") { upsertItem(params.turnId, { type: "fileChange", id: params.itemId, changes: params.changes, status: "inProgress" }); refreshGit(); }
  else if (method === "turn/diff/updated") { state.diff = params.diff; renderDiff(); }
  else if (method === "turn/completed") { const index = state.turns.findIndex((turn) => turn.id === params.turn.id); if (index === -1) state.turns.push(params.turn); else state.turns[index] = params.turn; state.activeTurnId = null; refreshThreads(); refreshGit(); }
  else if (method === "process/outputDelta") {
    const terminal = terminalForHandle(state.terminals, params.processHandle);
    if (!terminal) return;
    const visible = terminal.id === state.terminals.activeId && terminalPanelVisible();
    appendTerminalOutput(terminal, decodeBase64(params.deltaBase64), { visible }); renderTerminal(); return;
  }
  else if (method === "process/exited") {
    const terminal = terminalForHandle(state.terminals, params.processHandle);
    if (!terminal) return;
    const visible = terminal.id === state.terminals.activeId && terminalPanelVisible();
    const expectedExit = terminal.expectedExit;
    const finalOutput = `${params.stdout || ""}${params.stderr || ""}`;
    appendTerminalOutput(terminal, finalOutput || `\n[process exited ${params.exitCode ?? "unknown"}]\n`, { visible });
    terminal.status = "exited"; terminal.exitCode = params.exitCode ?? null; terminal.expectedExit = false; renderTerminal();
    if (!visible && !expectedExit) api.notifyTerminal({ processHandle: params.processHandle, terminalId: terminal.id, exitCode: terminal.exitCode, failedToStart: false }).catch(() => {});
    return;
  }
  else if (method === "error" || method === "warning" || method === "deprecationNotice") toast(params.message || params.error?.message || "Codex reported a warning");
  else if (method === "thread/name/updated") { if (params.name) els.threadTitle.textContent = params.name; refreshThreads(); }
  renderMessages(); updateComposer();
}

function queueRequest(request) { state.requestQueue.push(request); if (!state.currentRequest) showNextRequest(); }

async function activateNotificationTarget(target = {}) {
  if (target.kind === "thread") {
    if (target.threadId && target.threadId !== state.activeThread?.id) await resumeThread(target.threadId);
    els.conversation.scrollTop = els.conversation.scrollHeight;
    if (!state.activeTurnId) els.prompt.focus();
    return;
  }
  if (target.kind === "request") {
    if (!state.currentRequest) return;
    showDialog(els.overlay, els.allow.hidden ? els.deny : els.allow);
    return;
  }
  if (target.kind === "terminal") {
    const terminal = terminalForHandle(state.terminals, target.processHandle) || state.terminals.tabs.find((tab) => tab.id === target.terminalId);
    if (!terminal) return;
    activateTerminal(state.terminals, terminal.id);
    els.terminalPanel.classList.add("open");
    els.terminalPanel.setAttribute("aria-hidden", "false");
    renderTerminal();
    (terminal.status === "running" ? els.terminalInput : els.terminalOutput).focus();
  }
}

async function activateDeepLink(action = {}) {
  if (action.kind === "error") {
    toast(action.message || "That Codex Linux link could not be opened.");
    return;
  }
  if (action.kind === "open") {
    if (state.activeThread && !state.activeTurnId) els.prompt.focus();
    else els.threadSearch.focus();
    return;
  }
  if (!["thread", "project"].includes(action.kind)) return;
  if (!state.connected || !state.account) {
    state.pendingDeepLinks.push(action);
    if (state.pendingDeepLinks.length > 10) state.pendingDeepLinks.shift();
    await openAuth();
    toast("Connect your Codex account to finish opening the link.");
    return;
  }
  if (action.kind === "thread") {
    await resumeThread(action.threadId);
    return;
  }
  const existing = state.threads.find((thread) => thread.cwd === action.cwd);
  if (existing) {
    await resumeThread(existing.id);
    return;
  }
  const response = await api.startThread({
    cwd: action.cwd,
    model: els.model.value,
    approvalPolicy: "on-request",
    sandbox: "workspace-write",
  });
  setActiveThread(response.thread, response.thread.turns || []);
  await refreshThreads();
}

async function flushPendingDeepLinks() {
  if (state.flushingDeepLinks || !state.connected || !state.account) return;
  state.flushingDeepLinks = true;
  try {
    while (state.pendingDeepLinks.length && state.connected && state.account) {
      await activateDeepLink(state.pendingDeepLinks.shift());
    }
  } catch (error) {
    showError(error);
  } finally {
    state.flushingDeepLinks = false;
  }
}

function showNextRequest() {
  state.currentRequest = state.requestQueue.shift() || null; if (!state.currentRequest) { hideDialog(els.overlay, els.prompt); return; }
  const { method, params } = state.currentRequest; els.requestQuestions.replaceChildren(); els.requestCommand.hidden = false; els.allowSession.hidden = false; els.allow.hidden = false;
  els.deny.textContent = "Deny"; els.allow.textContent = "Allow once"; els.allowSession.textContent = "Allow for session";
  if (method === "item/commandExecution/requestApproval") { els.requestKind.textContent = "COMMAND APPROVAL"; els.requestTitle.textContent = "Codex wants to run a command"; els.requestReason.textContent = params.reason || `In ${params.cwd || "the current project"}`; els.requestCommand.textContent = params.command || "Command details unavailable"; }
  else if (method === "item/fileChange/requestApproval") { els.requestKind.textContent = "FILE APPROVAL"; els.requestTitle.textContent = "Codex wants to change files"; els.requestReason.textContent = params.reason || "Review the pending changes before allowing them."; els.requestCommand.textContent = params.grantRoot ? `Write access requested: ${params.grantRoot}` : state.diff || "File change details will appear in Changes."; }
  else if (method === "execCommandApproval") { els.requestKind.textContent = "COMMAND APPROVAL"; els.requestTitle.textContent = "Codex wants to run a command"; els.requestReason.textContent = params.reason || `In ${params.cwd}`; els.requestCommand.textContent = (params.command || []).join(" "); }
  else if (method === "applyPatchApproval") { els.requestKind.textContent = "FILE APPROVAL"; els.requestTitle.textContent = "Codex wants to apply a patch"; els.requestReason.textContent = params.reason || "Review the requested file changes."; els.requestCommand.textContent = JSON.stringify(params.fileChanges, null, 2); }
  else if (method === "item/permissions/requestApproval") {
    els.requestKind.textContent = "PERMISSION APPROVAL"; els.requestTitle.textContent = "Codex needs additional access"; els.requestReason.textContent = params.reason || `Requested while working in ${params.cwd}`;
    els.requestCommand.textContent = JSON.stringify(params.permissions, null, 2); els.allow.textContent = "Allow for turn"; els.allowSession.textContent = "Allow for session";
  }
  else if (method === "mcpServer/elicitation/request") {
    els.requestKind.textContent = "CONNECTED TOOL REQUEST"; els.requestTitle.textContent = `${params.serverName} needs your input`; els.requestReason.textContent = params.message; els.allowSession.hidden = true; els.allow.textContent = params.mode === "url" ? "Open and continue" : "Submit";
    if (params.mode === "url") els.requestCommand.textContent = params.url;
    else {
      els.requestCommand.hidden = true;
      const properties = params.requestedSchema?.properties || {};
      for (const [key, schema] of Object.entries(properties)) {
        const label = document.createElement("label"); label.textContent = schema.title || key; let control;
        const choices = schema.enum || schema.oneOf?.map((entry) => entry.const ?? entry.title).filter(Boolean);
        if (choices?.length) { control = document.createElement("select"); for (const choice of choices) control.add(new Option(String(choice), String(choice))); }
        else { control = document.createElement("input"); control.type = schema.type === "boolean" ? "checkbox" : schema.type === "number" || schema.type === "integer" ? "number" : schema.format === "password" ? "password" : "text"; if (schema.default !== undefined) control[control.type === "checkbox" ? "checked" : "value"] = schema.default; }
        control.dataset.elicitationKey = key; control.dataset.valueType = schema.type || "string"; label.append(control); els.requestQuestions.append(label);
      }
    }
  }
  else if (method === "item/tool/requestUserInput") {
    els.requestKind.textContent = "CODEX HAS A QUESTION"; els.requestTitle.textContent = "Your input is needed"; els.requestReason.textContent = "Answer below so Codex can continue."; els.requestCommand.hidden = true; els.allowSession.hidden = true; els.allow.textContent = "Submit"; els.deny.textContent = "Cancel turn";
    for (const question of params.questions) { const label = document.createElement("label"); label.textContent = question.question; let control;
      if (question.options?.length) { control = document.createElement("select"); for (const option of question.options) control.add(new Option(option.label, option.label)); }
      else { control = document.createElement("input"); control.type = question.isSecret ? "password" : "text"; }
      control.dataset.questionId = question.id; label.append(control); els.requestQuestions.append(label); }
  } else { els.requestKind.textContent = "UNSUPPORTED REQUEST"; els.requestTitle.textContent = "Codex needs an unavailable capability"; els.requestReason.textContent = "This early Linux client cannot safely answer this request."; els.requestCommand.textContent = method; els.allowSession.hidden = true; els.allow.hidden = true; els.deny.textContent = "Dismiss"; }
  showDialog(els.overlay, els.requestQuestions.querySelector("input,select,textarea") || els.deny);
}
async function answerCurrent(action) {
  const request = state.currentRequest; if (!request) return;
  try {
    if (request.method === "item/tool/requestUserInput") { if (action === "deny") await api.rejectRequest({ id: request.id, message: "User cancelled the input request" }); else { const answers = {}; for (const control of els.requestQuestions.querySelectorAll("[data-question-id]")) answers[control.dataset.questionId] = { answers: [control.value] }; await api.answerRequest({ id: request.id, result: { answers } }); } }
    else if (["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(request.method)) { const decision = action === "allow" ? "accept" : action === "session" ? "acceptForSession" : "decline"; await api.answerRequest({ id: request.id, result: { decision } }); }
    else if (["execCommandApproval", "applyPatchApproval"].includes(request.method)) { const decision = action === "allow" ? "approved" : action === "session" ? "approved_for_session" : "denied"; await api.answerRequest({ id: request.id, result: { decision } }); }
    else if (request.method === "item/permissions/requestApproval") {
      if (action === "deny") await api.rejectRequest({ id: request.id, message: "User denied the additional permissions" });
      else { const permissions = {}; if (request.params.permissions.network) permissions.network = request.params.permissions.network; if (request.params.permissions.fileSystem) permissions.fileSystem = request.params.permissions.fileSystem; await api.answerRequest({ id: request.id, result: { permissions, scope: action === "session" ? "session" : "turn" } }); }
    }
    else if (request.method === "mcpServer/elicitation/request") {
      if (action === "deny") await api.answerRequest({ id: request.id, result: { action: "decline", content: null, _meta: null } });
      else if (request.params.mode === "url") { await api.openExternal(request.params.url); await api.answerRequest({ id: request.id, result: { action: "accept", content: null, _meta: null } }); }
      else { const content = {}; for (const control of els.requestQuestions.querySelectorAll("[data-elicitation-key]")) { let value = control.type === "checkbox" ? control.checked : control.value; if (control.dataset.valueType === "number" || control.dataset.valueType === "integer") value = Number(value); content[control.dataset.elicitationKey] = value; } await api.answerRequest({ id: request.id, result: { action: "accept", content, _meta: null } }); }
    }
    else await api.rejectRequest({ id: request.id, message: `Unsupported request: ${request.method}` });
  } catch (error) { showError(error); }
  state.currentRequest = null; showNextRequest();
}
async function bootstrap() {
  try {
    const result = await api.bootstrap(); applyBootstrap(result);
    if (!state.restorationAttempted && result.lastThreadId && result.threads.some((thread) => thread.id === result.lastThreadId)) {
      state.restorationAttempted = true;
      await resumeThread(result.lastThreadId);
    }
  }
  catch (error) { try { state.cli = await api.cliStatus(); } catch {} setConnection(false, error.message); await openAuth(); }
  finally { try { await api.deepLinksReady(); } catch (error) { console.warn("Unable to initialize deep links", error); } }
}

function applyBootstrap(result) {
  state.threads = result.threads; state.models = result.models; state.cli = result.cli || state.cli; state.compatibility = result.compatibility || state.compatibility; state.desktop = result.desktop || state.desktop; state.updates = result.updates || state.updates; setConnection(true); renderAccount(result.account); renderModels(); renderThreads(); renderDesktopPreferences(); renderUpdateState();
  void flushPendingDeepLinks();
}

api.onEvent(async (event) => {
  if (event.kind === "notification") {
    if (event.method === "account/login/completed") {
      state.loginPending = false;
      if (event.params.success) { try { renderAccount(await api.readAccount()); toast("Signed in to Codex"); void flushPendingDeepLinks(); } catch (error) { showError(error); } }
      else { state.connectionError = event.params.error || "Login failed"; toast(state.connectionError); }
      renderAuth();
    } else if (event.method === "account/updated") {
      try { renderAccount(await api.readAccount()); void flushPendingDeepLinks(); } catch (error) { showError(error); }
    }
    handleNotification(event.method, event.params || {});
  } else if (event.kind === "request") queueRequest(event);
  else if (event.kind === "notificationActivated") {
    try { await activateNotificationTarget(event.target); } catch (error) { showError(error); }
  }
  else if (event.kind === "deepLink") {
    try { await activateDeepLink(event.action); } catch (error) { showError(error); }
  }
  else if (event.kind === "status") setConnection(event.connected, event.error);
  else if (event.kind === "compatibility") {
    state.compatibility = event.compatibility; renderAuth(); renderTerminal(); renderDiff();
    if (event.compatibility.status === "incompatible") toast(`Codex protocol mismatch: ${event.compatibility.missingMethod}`);
    else if (event.compatibility.status === "partial") toast(`Limited Codex protocol: ${event.compatibility.unavailableFeatures.join(", ")} unavailable`);
  }
  else if (event.kind === "desktopPreferences") { state.desktop = event.desktop; renderDesktopPreferences(); }
  else if (event.kind === "updateState") { state.updates = event.updates; renderUpdateState(); }
  else if (event.kind === "quickPrompt") { if (state.activeThread) { els.prompt.value = event.text; updateComposer(); els.prompt.focus(); } else chooseAndStartThread(event.text).catch(showError); }
  else if (event.kind === "log" && /error/i.test(event.message)) console.warn(event.message);
});
els.newThread.addEventListener("click", () => chooseAndStartThread().catch(showError)); els.openProject.addEventListener("click", () => chooseAndStartThread().catch(showError)); els.folder.addEventListener("click", () => chooseAndStartThread().catch(showError));
els.refresh.addEventListener("click", refreshThreads); els.threadSearch.addEventListener("input", renderThreads);
els.threadSearch.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown") return;
  const firstThread = els.threadList.querySelector(".thread-item");
  if (firstThread) { event.preventDefault(); firstThread.focus(); }
});
els.threadList.addEventListener("keydown", (event) => {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const threads = [...els.threadList.querySelectorAll(".thread-item")];
  if (!threads.length) return;
  event.preventDefault();
  const current = Math.max(0, threads.indexOf(document.activeElement));
  const target = event.key === "Home" ? 0
    : event.key === "End" ? threads.length - 1
      : event.key === "ArrowDown" ? Math.min(threads.length - 1, current + 1)
        : Math.max(0, current - 1);
  threads[target].focus();
});
els.prompt.addEventListener("input", () => { els.prompt.style.height = "auto"; els.prompt.style.height = `${Math.min(els.prompt.scrollHeight, 180)}px`; updateComposer(); });
els.prompt.addEventListener("keydown", (event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); sendTurn(); } }); els.send.addEventListener("click", sendTurn);
els.prompt.addEventListener("paste", async (event) => { if ([...event.clipboardData.files].some((file) => file.type.startsWith("image/"))) { event.preventDefault(); try { const image = await api.clipboardImage(); if (image) addAttachments([image]); } catch (error) { showError(error); } } });
for (const eventName of ["dragenter", "dragover"]) els.composer.addEventListener(eventName, (event) => { event.preventDefault(); els.composer.classList.add("dragging"); });
for (const eventName of ["dragleave", "drop"]) els.composer.addEventListener(eventName, (event) => { event.preventDefault(); els.composer.classList.remove("dragging"); });
els.composer.addEventListener("drop", async (event) => { try { const paths = [...event.dataTransfer.files].map((file) => api.pathForFile(file)).filter(Boolean); addAttachments(await api.prepareAttachments(paths)); } catch (error) { showError(error); } });
els.attach.addEventListener("click", chooseAttachments); els.screenshot.addEventListener("click", showCaptureSources); els.closeCapture.addEventListener("click", () => hideDialog(els.screenshotOverlay, els.screenshot));
els.camera.addEventListener("click", openCamera);
for (const button of [els.closeCamera, els.cancelCamera]) button.addEventListener("click", closeCamera);
els.cameraDevice.addEventListener("change", () => startCamera(els.cameraDevice.value).catch(handleCameraFailure));
els.captureCamera.addEventListener("click", () => captureCameraFrame().catch(showError));
els.regionCanvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !regionCapture.source || !els.regionImage.complete) return;
  event.preventDefault();
  const { point, bounds } = regionPoint(event);
  regionCapture.start = selectionFromPoints(point, point, bounds);
  regionCapture.start = { x: regionCapture.start.x, y: regionCapture.start.y };
  regionCapture.selection = null;
  regionCapture.dragging = true;
  els.regionCanvas.setPointerCapture(event.pointerId);
  updateRegionDrag(event);
});
els.regionCanvas.addEventListener("pointermove", updateRegionDrag);
els.regionCanvas.addEventListener("pointerup", (event) => {
  if (!regionCapture.dragging) return;
  updateRegionDrag(event);
  regionCapture.dragging = false;
  regionCapture.start = null;
  if (els.regionCanvas.hasPointerCapture(event.pointerId)) els.regionCanvas.releasePointerCapture(event.pointerId);
});
els.regionCanvas.addEventListener("pointercancel", () => {
  regionCapture.dragging = false;
  regionCapture.start = null;
  renderRegionSelection();
});
els.regionCanvas.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || !regionCapture.source || !els.regionImage.complete) return;
  event.preventDefault();
  const bounds = els.regionCanvas.getBoundingClientRect();
  const step = event.ctrlKey || event.metaKey ? 24 : 8;
  const selection = regionCapture.selection || {
    x: Math.round(bounds.width * 0.2),
    y: Math.round(bounds.height * 0.2),
    width: Math.round(bounds.width * 0.6),
    height: Math.round(bounds.height * 0.6),
  };
  let { x, y, width, height } = selection;
  const horizontal = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
  const vertical = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
  if (event.shiftKey) {
    width = Math.max(4, Math.min(bounds.width - x, width + horizontal));
    height = Math.max(4, Math.min(bounds.height - y, height + vertical));
  } else {
    x = Math.max(0, Math.min(bounds.width - width, x + horizontal));
    y = Math.max(0, Math.min(bounds.height - height, y + vertical));
  }
  regionCapture.selection = { x, y, width, height };
  renderRegionSelection();
});
els.regionImage.addEventListener("load", () => {
  renderRegionSelection();
  els.regionCanvas.focus();
});
for (const button of [els.closeRegion, els.cancelRegion]) button.addEventListener("click", closeRegionCapture);
els.captureRegion.addEventListener("click", async () => {
  const source = regionCapture.source;
  if (!source) return;
  try {
    const rect = imageCropForSelection();
    if (!rect || rect.width < 4 || rect.height < 4) throw new Error("Select a larger screenshot region");
    els.captureRegion.disabled = true;
    els.regionStatus.textContent = "Attaching selected region…";
    addAttachments([await api.captureSourceRegion({ sourceId: source.id, rect })]);
    closeRegionCapture();
  } catch (error) {
    renderRegionSelection();
    showError(error);
  }
});
els.stop.addEventListener("click", async () => { try { await api.interruptTurn({ threadId: state.activeThread.id, turnId: state.activeTurnId }); } catch (error) { showError(error); } });
els.diffButton.addEventListener("click", () => { refreshGit(); els.diffPanel.classList.add("open"); els.diffPanel.setAttribute("aria-hidden", "false"); els.closeDiff.focus(); }); els.closeDiff.addEventListener("click", () => closeDiffPanel());
for (const tab of document.querySelectorAll("[data-diff-view]")) tab.addEventListener("click", async () => { state.diffView = tab.dataset.diffView; state.gitSelection = null; state.gitFileDiff = ""; renderDiff(); const first = gitFilesForView()[0]; if (first) await selectGitFile(first.path); });
document.querySelector(".diff-tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !event.target.matches("[data-diff-view]")) return;
  const tabs = [...document.querySelectorAll("[data-diff-view]:not(:disabled)")];
  const current = Math.max(0, tabs.indexOf(event.target));
  const target = event.key === "Home" ? 0
    : event.key === "End" ? tabs.length - 1
      : event.key === "ArrowRight" ? (current + 1) % tabs.length
        : (current - 1 + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[target].focus();
  tabs[target].click();
});
els.refreshGit.addEventListener("click", refreshGit);
els.gitPrimary.addEventListener("click", () => runGitAction(state.diffView === "staged" ? "unstage" : "stage")); els.gitDiscard.addEventListener("click", () => runGitAction("discard"));
els.gitCommitMessage.addEventListener("input", renderDiff); els.gitCommitForm.addEventListener("submit", (event) => { event.preventDefault(); commitStaged(); });
els.terminalButton.addEventListener("click", openTerminal); els.closeTerminal.addEventListener("click", () => closeTerminalPanel()); els.newTerminal.addEventListener("click", () => startTerminal().catch(showError)); els.restartTerminal.addEventListener("click", restartActiveTerminal);
els.terminalTabs.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !event.target.matches(".terminal-tab-select")) return;
  const tabs = [...els.terminalTabs.querySelectorAll(".terminal-tab-select")];
  const current = Math.max(0, tabs.indexOf(event.target));
  const target = event.key === "Home" ? 0
    : event.key === "End" ? tabs.length - 1
      : event.key === "ArrowRight" ? (current + 1) % tabs.length
        : (current - 1 + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[target].focus();
  tabs[target].click();
});
els.terminalForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const data = els.terminalInput.value, terminal = activeTerminal(state.terminals);
  if (!data || terminal?.status !== "running") return;
  els.terminalInput.value = "";
  try { await api.writeTerminal({ processHandle: terminal.handle, data: `${data}\n` }); } catch (error) { showError(error); }
});
new ResizeObserver(() => {
  const terminal = activeTerminal(state.terminals); if (terminal?.status !== "running") return;
  clearTimeout(renderTerminal.resizeTimer);
  renderTerminal.resizeTimer = setTimeout(() => {
    const cols = Math.max(40, Math.floor(els.terminalOutput.clientWidth / 7.2));
    const rows = Math.max(10, Math.floor(els.terminalOutput.clientHeight / 16));
    api.resizeTerminal({ processHandle: terminal.handle, cols, rows }).catch(() => {});
  }, 120);
}).observe(els.terminalOutput);
els.deny.addEventListener("click", () => answerCurrent("deny")); els.allowSession.addEventListener("click", () => answerCurrent("session")); els.allow.addEventListener("click", () => answerCurrent("allow"));
els.accountButton.addEventListener("click", openAuth);
els.brandMenuButton.addEventListener("click", () => setBrandMenuOpen(els.brandMenu.hidden));
els.brandMenuButton.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown") return;
  event.preventDefault();
  setBrandMenuOpen(true);
});
els.settings.addEventListener("click", () => {
  setBrandMenuOpen(false, { restoreFocus: true });
  openAuth();
});
els.home.addEventListener("click", showHome);
els.closeAuth.addEventListener("click", () => hideDialog(els.authOverlay, els.brandMenuButton));
els.shortcutSelect.addEventListener("change", () => saveDesktopPreferences({ quickPromptShortcut: els.shortcutSelect.value || null }));
els.trayEnabled.addEventListener("change", () => saveDesktopPreferences({ trayEnabled: els.trayEnabled.checked }));
els.closeToTray.addEventListener("change", () => saveDesktopPreferences({ closeToTray: els.closeToTray.checked }));
els.launchAtLogin.addEventListener("change", () => saveDesktopPreferences({ launchAtLogin: els.launchAtLogin.checked }));
els.textScale.addEventListener("change", () => saveDesktopPreferences({ textScale: Number(els.textScale.value) }));
els.reduceMotion.addEventListener("change", () => saveDesktopPreferences({ reduceMotion: els.reduceMotion.checked }));
els.highContrast.addEventListener("change", () => saveDesktopPreferences({ highContrast: els.highContrast.checked }));
els.notifyTurnComplete.addEventListener("change", () => saveDesktopPreferences({ notifyTurnComplete: els.notifyTurnComplete.checked }));
els.notifyApproval.addEventListener("change", () => saveDesktopPreferences({ notifyApproval: els.notifyApproval.checked }));
els.notifyTerminal.addEventListener("change", () => saveDesktopPreferences({ notifyTerminal: els.notifyTerminal.checked }));
els.updateChannel.addEventListener("change", () => saveUpdatePreferences({ channel: els.updateChannel.value }));
els.autoCheckUpdates.addEventListener("change", () => saveUpdatePreferences({ autoCheck: els.autoCheckUpdates.checked }));
els.checkUpdates.addEventListener("click", () => runUpdateAction("check"));
els.downloadUpdate.addEventListener("click", () => runUpdateAction("download"));
els.installUpdate.addEventListener("click", () => runUpdateAction("install"));
els.viewReleases.addEventListener("click", () => api.openReleases().catch(showError));
els.authDocs.addEventListener("click", () => api.openExternal("https://developers.openai.com/codex/cli/"));
els.retryConnection.addEventListener("click", async () => { try { applyBootstrap(await api.bootstrap()); toast("Codex connected"); } catch (error) { state.connectionError = error.message; showError(error); renderAuth(); } });
els.chooseCli.addEventListener("click", async () => { try { const result = await api.chooseCodexCli(); if (result) { applyBootstrap(result); toast("Codex CLI connected"); } } catch (error) { state.connectionError = error.message; showError(error); renderAuth(); } });
els.signIn.addEventListener("click", async () => { try { state.loginPending = true; renderAuth(); await api.loginChatGPT(); } catch (error) { state.loginPending = false; showError(error); renderAuth(); } });
els.logout.addEventListener("click", async () => { try { renderAccount(await api.logout()); toast("Signed out of Codex"); } catch (error) { showError(error); } });
els.more.addEventListener("click", openDiagnostics); els.closeDiagnostics.addEventListener("click", () => hideDialog(els.diagnosticsOverlay, els.more));
els.copyDiagnostics.addEventListener("click", async () => { try { await api.copyDiagnostics(); toast("Diagnostics copied"); } catch (error) { showError(error); } });
els.exportDiagnostics.addEventListener("click", async () => { try { const filePath = await api.exportDiagnostics(); if (filePath) toast(`Diagnostics exported to ${filePath}`); } catch (error) { showError(error); } });
els.showLog.addEventListener("click", () => api.showLogFile().catch(showError));
for (const overlay of [els.authOverlay, els.screenshotOverlay, els.cameraOverlay, els.diagnosticsOverlay]) {
  overlay.addEventListener("click", closeOnBackdropClick);
}
document.addEventListener("click", (event) => {
  if (!els.brandMenu.hidden && !event.target.closest(".brand-menu")) setBrandMenuOpen(false);
});
document.addEventListener("keydown", (event) => {
  const modal = activeModal();
  if (modal) {
    if (trapModalFocus(event, modal)) return;
    if (event.key === "Escape") { event.preventDefault(); closeActiveModal(modal); }
    return;
  }
  if (!els.brandMenu.hidden && event.key === "Escape") {
    event.preventDefault();
    setBrandMenuOpen(false, { restoreFocus: true });
    return;
  }
  const editable = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target?.isContentEditable;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") { event.preventDefault(); chooseAndStartThread().catch(showError); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") { event.preventDefault(); openTerminal(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); els.threadSearch.focus(); els.threadSearch.select(); }
  if ((event.ctrlKey || event.metaKey) && event.key === ",") { event.preventDefault(); openAuth(); }
  if (event.altKey && event.key === "ArrowLeft" && state.activeThread) { event.preventDefault(); showHome(); }
  if (!editable && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "/") { event.preventDefault(); els.threadSearch.focus(); }
  if (event.key === "F6") {
    event.preventDefault();
    const regions = [els.newThread, els.conversation, !els.prompt.disabled ? els.prompt : null].filter(isVisible);
    const current = regions.findIndex((element) => element === document.activeElement || element.contains?.(document.activeElement));
    regions[(current + 1) % regions.length]?.focus();
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "`" && terminalPanelVisible()) { event.preventDefault(); startTerminal().catch(showError); }
  if (event.key === "Escape") {
    if (els.diffPanel.classList.contains("open")) closeDiffPanel();
    else if (terminalPanelVisible()) closeTerminalPanel();
  }
});
for (const query of [reduceMotionQuery, highContrastQuery]) query.addEventListener("change", () => renderDesktopPreferences());
window.addEventListener("beforeunload", () => { cameraCapture.requestId += 1; stopCameraStream(); });
for (const button of document.querySelectorAll("[data-prompt]")) button.addEventListener("click", () => chooseAndStartThread(button.dataset.prompt).catch(showError));
bootstrap();
