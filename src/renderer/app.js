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
import { responseForRequest } from "./approval-state.mjs";
import { mergeTurnSnapshot } from "./conversation-state.mjs";
import { selectionFromPoints, selectionToImage } from "../shared/capture-region.mjs";

const api = window.codexDesktop;
const $ = (selector) => document.querySelector(selector);
const state = { connected: false, connectionError: null, account: null, cli: null, compatibility: null, desktop: null, updates: null, stability: null, reporting: null, extensions: null, tasks: { tasks: [], inbox: [], limits: { maxConcurrent: 2, active: 0, queued: 0 }, counts: {}, unread: 0 }, creation: { templates: [], artifacts: [] }, studioTab: "canvas", selectedArtifactId: null, selectedTemplateId: null, searchResults: [], voiceCapability: null, review: null, reviewTab: "changes", loginPending: false, restorationAttempted: false, threads: [], models: [], activeThread: null, turns: [], activeTurnId: null, diff: "", diffView: "working", git: null, gitDiffs: { working: "", staged: "" }, gitSelection: null, gitFileDiff: "", attachments: [], terminals: createTerminalCollection(), requestQueue: [], currentRequest: null, pendingDeepLinks: [], flushingDeepLinks: false };
const regionCapture = { source: null, start: null, selection: null, dragging: false };
const cameraCapture = { stream: null, requestId: 0, devices: [] };
const voiceCapture = { stream: null, context: null, source: null, processor: null, mode: null, transcript: "", chunkQueue: Promise.resolve(), playbackAt: 0 };

const els = {
  home: $("#homeButton"), tasksButton: $("#tasksButton"), tasksBadge: $("#tasksBadge"), reviewButton: $("#reviewButton"), reviewBadge: $("#reviewBadge"), studioButton: $("#studioButton"), brandMenuButton: $("#brandMenuButton"), brandMenu: $("#brandMenu"), settings: $("#settingsButton"), extensions: $("#extensionsButton"),
  threadList: $("#threadList"), threadSearch: $("#threadSearch"), refresh: $("#refreshButton"),
  newThread: $("#newThreadButton"), openProject: $("#openProjectButton"), folder: $("#folderButton"), folderName: $("#folderName"),
  threadTitle: $("#threadTitle"), projectPath: $("#projectPath"), welcome: $("#welcome"), messages: $("#messages"), conversation: $("#conversation"),
  prompt: $("#promptInput"), send: $("#sendButton"), stop: $("#stopButton"), model: $("#modelSelect"), effort: $("#effortSelect"), dictation: $("#dictationButton"),
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
  textScale: $("#textScaleSelect"), reduceMotion: $("#reduceMotionInput"), highContrast: $("#highContrastInput"), screenReaderMode: $("#screenReaderModeInput"), accessibilityPreferenceStatus: $("#accessibilityPreferenceStatus"), assistiveAnnouncements: $("#assistiveAnnouncements"),
  notifyTurnComplete: $("#notifyTurnCompleteInput"), notifyApproval: $("#notifyApprovalInput"), notifyTerminal: $("#notifyTerminalInput"), notificationPreferenceStatus: $("#notificationPreferenceStatus"),
  updateChannel: $("#updateChannelSelect"), autoCheckUpdates: $("#autoCheckUpdatesInput"), updatePreferenceStatus: $("#updatePreferenceStatus"),
  checkUpdates: $("#checkUpdatesButton"), downloadUpdate: $("#downloadUpdateButton"), installUpdate: $("#installUpdateButton"), viewReleases: $("#viewReleasesButton"),
  reportingEnabled: $("#reportingEnabledInput"), reportingPreferenceStatus: $("#reportingPreferenceStatus"), copyCompatibilityReport: $("#copyCompatibilityReportButton"),
  extensionsOverlay: $("#extensionsOverlay"), closeExtensions: $("#closeExtensionsButton"), refreshExtensions: $("#refreshExtensionsButton"),
  extensionsSummary: $("#extensionsSummary"), extensionIssues: $("#extensionIssues"),
  skillsList: $("#skillsList"), skillsCount: $("#skillsCount"), pluginsList: $("#pluginsList"), pluginsCount: $("#pluginsCount"),
  mcpList: $("#mcpList"), mcpCount: $("#mcpCount"), configList: $("#configList"), configCount: $("#configCount"),
  tasksOverlay: $("#tasksOverlay"), closeTasks: $("#closeTasksButton"), tasksSummary: $("#tasksSummary"),
  taskForm: $("#taskForm"), taskPrompt: $("#taskPromptInput"), taskTitle: $("#taskTitleInput"), taskRepository: $("#taskRepositoryInput"),
  chooseTaskRepository: $("#chooseTaskRepositoryButton"), taskIsolation: $("#taskIsolationSelect"), taskBaseRef: $("#taskBaseRefInput"),
  taskModel: $("#taskModelSelect"), taskEffort: $("#taskEffortSelect"), queueTask: $("#queueTaskButton"),
  taskTemplate: $("#taskTemplateSelect"), applyTaskTemplate: $("#applyTaskTemplateButton"), saveTaskTemplate: $("#saveTaskTemplateButton"),
  taskQueueList: $("#taskQueueList"), taskQueueCount: $("#taskQueueCount"), agentActivityList: $("#agentActivityList"),
  agentActivityCount: $("#agentActivityCount"), taskInboxList: $("#taskInboxList"), taskInboxCount: $("#taskInboxCount"),
  reviewOverlay: $("#reviewOverlay"), closeReview: $("#closeReviewButton"), refreshReview: $("#refreshReviewButton"), reviewCopy: $("#reviewCopy"), reviewSummary: $("#reviewSummary"),
  reviewTabs: $("#reviewTabs"), reviewChanges: $("#reviewChanges"), reviewChecks: $("#reviewChecks"), reviewEvidence: $("#reviewEvidence"),
  reviewBranchForm: $("#reviewBranchForm"), reviewBranchName: $("#reviewBranchName"), reviewCommitForm: $("#reviewCommitForm"), reviewCommitMessage: $("#reviewCommitMessage"),
  reviewPushStatus: $("#reviewPushStatus"), reviewPush: $("#reviewPushButton"), reviewPrForm: $("#reviewPrForm"), reviewPrBase: $("#reviewPrBase"), reviewPrTitle: $("#reviewPrTitle"), reviewPrBody: $("#reviewPrBody"), reviewPrButton: $("#reviewPrButton"),
  githubReviewStatus: $("#githubReviewStatus"), reviewIssues: $("#reviewIssues"), reviewPulls: $("#reviewPulls"), reviewRuns: $("#reviewRuns"), reviewComments: $("#reviewComments"),
  reviewPolicy: $("#reviewPolicy"), copyTaskSummary: $("#copyTaskSummaryButton"), copyShareableDiagnostics: $("#copyShareableDiagnosticsButton"),
  studioOverlay: $("#studioOverlay"), closeStudio: $("#closeStudioButton"), studioStatus: $("#studioStatus"), studioTabs: $("#studioTabs"),
  studioCanvas: $("#studioCanvas"), studioSearch: $("#studioSearch"), studioTemplates: $("#studioTemplates"), studioVoice: $("#studioVoice"),
  artifactList: $("#artifactList"), newArtifact: $("#newArtifactButton"), newArtifactEmpty: $("#newArtifactEmptyButton"), artifactEmpty: $("#artifactEmpty"), artifactForm: $("#artifactForm"),
  artifactTitle: $("#artifactTitleInput"), artifactKind: $("#artifactKindSelect"), artifactBody: $("#artifactBodyInput"), artifactPreview: $("#artifactPreview"),
  saveArtifact: $("#saveArtifactButton"), attachArtifact: $("#attachArtifactButton"), exportArtifact: $("#exportArtifactButton"), deleteArtifact: $("#deleteArtifactButton"),
  workspaceSearchForm: $("#workspaceSearchForm"), workspaceSearchInput: $("#workspaceSearchInput"), workspaceSearchButton: $("#workspaceSearchButton"), workspaceSearchSummary: $("#workspaceSearchSummary"), workspaceSearchResults: $("#workspaceSearchResults"),
  templateList: $("#templateList"), templateForm: $("#templateForm"), newTemplate: $("#newTemplateButton"), templateId: $("#templateIdInput"), templateName: $("#templateNameInput"), templateDescription: $("#templateDescriptionInput"),
  templatePrompt: $("#templatePromptInput"), templateIsolation: $("#templateIsolationSelect"), templateBaseRef: $("#templateBaseRefInput"), templateEffort: $("#templateEffortSelect"), deleteTemplate: $("#deleteTemplateButton"),
  voiceOrb: $("#voiceOrb"), voiceTitle: $("#voiceTitle"), voiceDescription: $("#voiceDescription"), voiceSelect: $("#voiceSelect"), studioDictation: $("#studioDictationButton"), voiceConversation: $("#voiceConversationButton"), stopVoice: $("#stopVoiceButton"), voiceTranscript: $("#voiceTranscript"),
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
  return [els.overlay, els.tasksOverlay, els.reviewOverlay, els.studioOverlay, els.authOverlay, els.extensionsOverlay, els.screenshotOverlay, els.cameraOverlay, els.diagnosticsOverlay, els.regionOverlay];
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
  else if (overlay === els.tasksOverlay) hideDialog(els.tasksOverlay, els.tasksButton);
  else if (overlay === els.reviewOverlay) hideDialog(els.reviewOverlay, els.reviewButton);
  else if (overlay === els.studioOverlay) hideDialog(els.studioOverlay, els.studioButton);
  else if (overlay === els.extensionsOverlay) hideDialog(els.extensionsOverlay, els.brandMenuButton);
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
  document.documentElement.classList.toggle("screen-reader-mode", preferences.screenReaderMode === true);
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
function announce(message) {
  if (!state.desktop?.preferences?.screenReaderMode || !message) return;
  els.assistiveAnnouncements.textContent = "";
  requestAnimationFrame(() => { els.assistiveAnnouncements.textContent = message; });
}
function reportRenderMetric(name, startedAt) {
  api.reportPerformance({ name, durationMs: performance.now() - startedAt }).catch(() => {});
}
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
  els.screenReaderMode.checked = preferences.screenReaderMode;
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

function renderReportingState() {
  const reporting = state.reporting || state.stability?.reporting;
  if (!reporting) return;
  els.reportingEnabled.checked = reporting.preferences?.enabled === true;
  els.reportingPreferenceStatus.className = "setting-status";
  if (!els.reportingEnabled.checked) els.reportingPreferenceStatus.textContent = "Disabled. No crash or compatibility report is sent.";
  else if (reporting.endpointConfigured) {
    els.reportingPreferenceStatus.classList.add("good");
    els.reportingPreferenceStatus.textContent = "Enabled for bounded crash and compatibility reports only.";
  } else {
    els.reportingPreferenceStatus.classList.add("warn");
    els.reportingPreferenceStatus.textContent = "Consent is saved, but this community build has no reporting endpoint configured.";
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
  try { state.stability = await api.stabilityState(); state.reporting = state.stability.reporting; } catch (error) { console.warn("Unable to read stability state", error); }
  renderAuth();
  renderUpdateState();
  renderReportingState();
}

function extensionMeta(...values) {
  const container = document.createElement("div");
  container.className = "extension-meta";
  for (const value of values.filter(Boolean)) {
    const label = document.createElement("span");
    label.textContent = value;
    container.append(label);
  }
  return container;
}

function extensionState(label, condition) {
  const status = document.createElement("span");
  status.className = `extension-state ${condition === "warn" ? "warn" : condition ? "good" : "bad"}`;
  status.textContent = label;
  return status;
}

function extensionCard(item, { kind, manageable, statusLabel = item.enabled ? "Enabled" : "Disabled", statusCondition = item.enabled ? true : "warn", metadata = [] } = {}) {
  const card = document.createElement("div");
  card.className = "extension-card";
  card.setAttribute("role", "listitem");
  const main = document.createElement("div");
  main.className = "extension-card-main";
  const heading = document.createElement("div");
  heading.className = "extension-card-title";
  const title = document.createElement("strong");
  title.textContent = item.name || item.displayName || item.id;
  heading.append(title, extensionState(statusLabel, statusCondition));
  const description = document.createElement("p");
  description.textContent = item.description || "No description provided.";
  main.append(heading, description, extensionMeta(...metadata));
  const toggle = document.createElement("label");
  toggle.className = "extension-toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = item.enabled;
  input.disabled = !manageable || !item.editable || item.managed;
  input.setAttribute("aria-label", `${item.enabled ? "Disable" : "Enable"} ${item.name || item.displayName || item.id}`);
  const toggleText = document.createElement("span");
  toggleText.textContent = item.managed
    ? "Managed"
    : item.editable && manageable
      ? item.enabled
        ? "On"
        : "Off"
      : "Read only";
  toggle.append(input, toggleText);
  input.addEventListener("change", async () => {
    input.disabled = true;
    try {
      state.extensions = await api.setExtensionEnabled({ kind, id: item.id, enabled: input.checked });
      renderExtensions();
      toast(`${item.name || item.displayName || item.id} ${input.checked ? "enabled" : "disabled"}`);
    } catch (error) {
      input.checked = item.enabled;
      input.disabled = !manageable || !item.editable || item.managed;
      showError(error);
    }
  });
  card.append(main, toggle);
  return card;
}

function renderExtensionSection(list, section, unavailableMessage, renderItem) {
  list.replaceChildren();
  if (!section?.available) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = section?.error || unavailableMessage;
    list.append(empty);
    return;
  }
  if (section.error) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = section.error;
    list.append(empty);
    return;
  }
  if (!section.value?.items?.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "Nothing installed or configured.";
    list.append(empty);
    return;
  }
  for (const item of section.value.items) list.append(renderItem(item));
}

function renderExtensions() {
  const inventory = state.extensions;
  if (!inventory) return;
  const summary = inventory.summary;
  els.extensionsSummary.replaceChildren(
    diagnosticPill(`${summary.enabledSkills}/${summary.skills} skills`, summary.skills ? true : "warn"),
    diagnosticPill(`${summary.enabledPlugins}/${summary.plugins} plugins`, inventory.capabilities.pluginInventory ? (summary.plugins ? true : "warn") : "warn"),
    diagnosticPill(`${summary.readyMcpServers}/${summary.mcpServers} MCP ready`, summary.mcpServers ? summary.readyMcpServers === summary.mcpServers : "warn"),
    diagnosticPill(summary.issues ? `${summary.issues} issue${summary.issues === 1 ? "" : "s"}` : "Healthy", summary.issues ? false : true),
  );
  els.skillsCount.textContent = inventory.skills?.available ? String(summary.skills) : "N/A";
  els.pluginsCount.textContent = inventory.plugins?.available ? String(summary.plugins) : "N/A";
  els.mcpCount.textContent = inventory.mcp?.available ? String(summary.mcpServers) : "N/A";
  els.configCount.textContent = String(inventory.configuration?.files?.length || 0);
  els.extensionIssues.replaceChildren();
  els.extensionIssues.hidden = !inventory.issues.length;
  for (const issue of inventory.issues) {
    const message = document.createElement("p");
    message.textContent = `${issue.section}: ${issue.message}`;
    els.extensionIssues.append(message);
  }

  renderExtensionSection(els.skillsList, inventory.skills, "This Codex CLI does not expose skill inventory.", (item) => extensionCard(item, {
    kind: "skill",
    manageable: inventory.capabilities.skillManagement,
    metadata: [item.scope, `${item.dependencies} tool dependenc${item.dependencies === 1 ? "y" : "ies"}`],
  }));
  renderExtensionSection(els.pluginsList, inventory.plugins, "Installed plugin inventory is unavailable in this Codex CLI.", (item) => extensionCard(item, {
    kind: "plugin",
    manageable: inventory.capabilities.pluginManagement,
    metadata: [item.marketplace, item.version ? `v${item.version}` : null, item.source],
  }));
  renderExtensionSection(els.mcpList, inventory.mcp, "This Codex CLI does not expose MCP server status.", (item) => extensionCard(item, {
    kind: "mcp",
    manageable: inventory.capabilities.mcpManagement,
    statusLabel: item.status === "needs-auth" ? "Needs auth" : item.status === "ready" ? "Ready" : item.status === "disabled" ? "Disabled" : "Unavailable",
    statusCondition: item.status === "ready" ? true : item.status === "needs-auth" || item.status === "disabled" ? "warn" : false,
    metadata: [item.source, `${item.tools} tool${item.tools === 1 ? "" : "s"}`, item.authStatus, item.required ? "required" : null, item.version ? `v${item.version}` : null],
  }));

  els.configList.replaceChildren();
  const files = inventory.configuration?.files || [];
  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = inventory.configuration?.error || "Codex did not report any configuration layers.";
    els.configList.append(empty);
  }
  for (const file of files) {
    const card = document.createElement("div");
    card.className = "extension-card config-card";
    card.setAttribute("role", "listitem");
    const main = document.createElement("div");
    main.className = "extension-card-main";
    const title = document.createElement("div");
    title.className = "extension-card-title";
    const name = document.createElement("strong");
    name.textContent = `${file.kind[0]?.toUpperCase() || ""}${file.kind.slice(1)} configuration`;
    title.append(name, extensionState(file.exists ? "Available" : "Not created", file.exists ? true : "warn"));
    const filePath = document.createElement("code");
    filePath.textContent = file.path;
    main.append(title, filePath, extensionMeta(file.editable ? "user editable" : "read only"));
    const open = document.createElement("button");
    open.className = "secondary-button";
    open.textContent = file.exists ? "Show file" : "Open folder";
    open.addEventListener("click", () => api.showCodexConfig(file.path).catch(showError));
    card.append(main, open);
    els.configList.append(card);
  }
}

async function loadExtensions({ forceReload = false } = {}) {
  els.refreshExtensions.disabled = true;
  try {
    state.extensions = await api.extensionInventory({ forceReload });
    renderExtensions();
  } catch (error) {
    els.skillsList.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = error.message;
    els.skillsList.append(empty);
    showError(error);
  } finally {
    els.refreshExtensions.disabled = false;
  }
}

function openExtensions() {
  setBrandMenuOpen(false);
  showDialog(els.extensionsOverlay, els.closeExtensions);
  loadExtensions({ forceReload: true });
}

function taskAge(timestamp) {
  if (!Number.isFinite(timestamp)) return "";
  return relativeTime(timestamp / 1000);
}

function taskStatusLabel(value) {
  return {
    queued: "Queued",
    preparing: "Preparing",
    running: "Running",
    waiting: "Waiting",
    recovering: "Recovering",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Stopped",
  }[value] || value;
}

function metaRow(...values) {
  const row = document.createElement("div");
  row.className = "task-meta";
  for (const value of values.filter(Boolean)) {
    const item = document.createElement("span");
    item.textContent = value;
    row.append(item);
  }
  return row;
}

async function openTaskThread(task) {
  if (!task.threadId) return;
  hideDialog(els.tasksOverlay, els.tasksButton);
  await resumeThread(task.threadId);
}

function renderTasks() {
  const tasksState = state.tasks;
  const tasks = tasksState?.tasks || [];
  const inbox = tasksState?.inbox || [];
  const limits = tasksState?.limits || { active: 0, queued: 0, maxConcurrent: 2 };
  const agents = tasks.flatMap((task) => (task.agents || []).map((agent) => ({ ...agent, task })));
  els.tasksBadge.hidden = !tasksState?.unread && !limits.active;
  els.tasksBadge.textContent = String(tasksState?.unread || limits.active || 0);
  els.tasksSummary.replaceChildren();
  for (const [label, value] of [["active", `${limits.active}/${limits.maxConcurrent}`], ["queued", limits.queued], ["inbox", tasksState?.unread || 0]]) {
    const pill = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    pill.append(strong, ` ${label}`);
    els.tasksSummary.append(pill);
  }
  els.taskQueueCount.textContent = String(tasks.length);
  els.agentActivityCount.textContent = String(agents.length);
  els.taskInboxCount.textContent = String(inbox.filter((item) => !item.resolved).length);

  els.taskQueueList.replaceChildren();
  if (!tasks.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "No background tasks yet.";
    els.taskQueueList.append(empty);
  }
  for (const task of tasks) {
    const card = document.createElement("article");
    card.className = "task-card";
    card.setAttribute("role", "listitem");
    const heading = document.createElement("div");
    heading.className = "task-card-heading";
    const title = document.createElement("strong");
    title.textContent = task.title;
    const status = document.createElement("span");
    status.className = `task-state ${task.state}`;
    status.textContent = taskStatusLabel(task.state);
    heading.append(title, status);
    const description = document.createElement("p");
    description.textContent = task.error || task.summary || task.prompt;
    const metadata = metaRow(basename(task.repository), task.isolation === "worktree" ? "worktree" : "local", taskAge(task.updatedAt), task.agents?.length ? `${task.agents.length} agent${task.agents.length === 1 ? "" : "s"}` : null);
    const actions = document.createElement("div");
    actions.className = "task-actions";
    if (task.threadId) {
      const open = document.createElement("button");
      open.type = "button";
      open.textContent = "Open thread";
      open.addEventListener("click", () => openTaskThread(task).catch(showError));
      actions.append(open);
    }
    if (task.worktreePath || task.cwd) {
      const files = document.createElement("button");
      files.type = "button";
      files.textContent = task.worktreePath ? "Open worktree" : "Open project";
      files.addEventListener("click", () => api.showTaskWorktree(task.id).catch(showError));
      actions.append(files);
    }
    if (["queued", "preparing", "running", "waiting", "recovering"].includes(task.state)) {
      const stop = document.createElement("button");
      stop.type = "button";
      stop.className = "stop-task";
      stop.textContent = "Stop";
      stop.addEventListener("click", async () => {
        stop.disabled = true;
        try { state.tasks = await api.cancelTask(task.id); renderTasks(); }
        catch (error) { stop.disabled = false; showError(error); }
      });
      actions.append(stop);
    } else {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Retry";
      retry.addEventListener("click", async () => {
        retry.disabled = true;
        try { state.tasks = await api.retryTask(task.id); renderTasks(); }
        catch (error) { retry.disabled = false; showError(error); }
      });
      actions.append(retry);
    }
    card.append(heading, description, metadata, actions);
    els.taskQueueList.append(card);
  }

  els.agentActivityList.replaceChildren();
  if (!agents.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "Subagent ownership and handoffs will appear here.";
    els.agentActivityList.append(empty);
  }
  for (const agent of agents.sort((left, right) => right.updatedAt - left.updatedAt)) {
    const card = document.createElement("article");
    card.className = "agent-card";
    card.setAttribute("role", "listitem");
    const heading = document.createElement("div");
    heading.className = "agent-card-heading";
    const identity = document.createElement("div");
    const dot = document.createElement("span");
    dot.className = `agent-status-dot ${agent.status}`;
    const labels = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = agent.name;
    const taskName = document.createElement("small");
    taskName.textContent = agent.task.title;
    labels.append(name, taskName);
    identity.append(dot, labels);
    const status = document.createElement("span");
    status.className = "task-state";
    status.textContent = agent.status;
    heading.append(identity, status);
    const description = document.createElement("p");
    description.textContent = agent.message || agent.role || "Working under the task’s Codex thread.";
    const metadata = metaRow(agent.model, agent.effort, agent.role, taskAge(agent.updatedAt));
    card.append(heading, description, metadata);
    els.agentActivityList.append(card);
  }

  els.taskInboxList.replaceChildren();
  const visibleInbox = inbox.filter((item) => !item.resolved);
  if (!visibleInbox.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "You’re all caught up.";
    els.taskInboxList.append(empty);
  }
  for (const item of visibleInbox) {
    const card = document.createElement("article");
    card.className = "inbox-card unread";
    card.setAttribute("role", "listitem");
    const heading = document.createElement("div");
    heading.className = "inbox-card-heading";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const kind = document.createElement("span");
    kind.className = "inbox-kind";
    kind.textContent = item.kind;
    heading.append(title, kind);
    const detail = document.createElement("p");
    detail.textContent = item.detail;
    const actions = document.createElement("div");
    actions.className = "inbox-actions";
    const task = tasks.find((candidate) => candidate.id === item.taskId);
    if (task?.threadId) {
      const open = document.createElement("button");
      open.type = "button";
      open.textContent = item.requestId ? "Open request" : "Open task";
      open.addEventListener("click", () => openTaskThread(task).catch(showError));
      actions.append(open);
    }
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", async () => {
      dismiss.disabled = true;
      try { state.tasks = await api.dismissTaskInbox(item.id); renderTasks(); }
      catch (error) { dismiss.disabled = false; showError(error); }
    });
    actions.append(dismiss);
    card.append(heading, detail, actions);
    els.taskInboxList.append(card);
  }
}

function renderTaskModels() {
  const selected = els.taskModel.value;
  els.taskModel.replaceChildren(new Option("Default model", ""));
  for (const model of state.models.filter((entry) => !entry.hidden)) {
    els.taskModel.add(new Option(model.displayName + (model.isDefault ? " · default" : ""), model.model));
  }
  els.taskModel.value = state.models.some((model) => model.model === selected) ? selected : "";
}

function renderTaskTemplates() {
  const selected = els.taskTemplate.value;
  els.taskTemplate.replaceChildren(new Option("Start without a template", ""));
  for (const template of state.creation.templates || []) {
    els.taskTemplate.add(new Option(`${template.name}${template.builtin ? " · built in" : ""}`, template.id));
  }
  els.taskTemplate.value = state.creation.templates.some((template) => template.id === selected) ? selected : "";
}

function applyTaskTemplate(template) {
  if (!template) return;
  els.taskPrompt.value = template.prompt;
  els.taskIsolation.value = template.isolation;
  els.taskBaseRef.value = template.baseRef || "HEAD";
  els.taskBaseRef.disabled = template.isolation !== "worktree";
  els.taskEffort.value = template.effort || "";
  if (template.model && [...els.taskModel.options].some((option) => option.value === template.model)) els.taskModel.value = template.model;
}

async function openTasks() {
  if (!els.taskRepository.value && state.activeThread?.cwd) els.taskRepository.value = state.activeThread.cwd;
  renderTaskModels();
  renderTaskTemplates();
  renderTasks();
  showDialog(els.tasksOverlay, els.taskPrompt);
  try {
    state.tasks = await api.taskState();
    renderTasks();
  } catch (error) { showError(error); }
}

async function queueBackgroundTask() {
  const payload = {
    title: els.taskTitle.value,
    prompt: els.taskPrompt.value,
    repository: els.taskRepository.value,
    isolation: els.taskIsolation.value,
    baseRef: els.taskBaseRef.value || "HEAD",
    model: els.taskModel.value || null,
    effort: els.taskEffort.value || null,
  };
  els.queueTask.disabled = true;
  try {
    state.tasks = await api.createTask(payload);
    els.taskPrompt.value = "";
    els.taskTitle.value = "";
    renderTasks();
    toast("Background task queued");
  } finally {
    els.queueTask.disabled = false;
  }
}

function setStudioTab(name) {
  state.studioTab = ["canvas", "search", "templates", "voice"].includes(name) ? name : "canvas";
  const views = { canvas: els.studioCanvas, search: els.studioSearch, templates: els.studioTemplates, voice: els.studioVoice };
  for (const tab of els.studioTabs.querySelectorAll("[data-studio-tab]")) {
    const active = tab.dataset.studioTab === state.studioTab;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const [viewName, view] of Object.entries(views)) view.hidden = viewName !== state.studioTab;
  if (state.studioTab === "voice") void loadVoiceCapability();
}

function artifactDate(timestamp) {
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

function selectedArtifact() {
  return state.creation.artifacts.find((artifact) => artifact.id === state.selectedArtifactId) || null;
}

function renderArtifactPreview() {
  const body = els.artifactBody.value;
  if (window.RichText) {
    els.artifactPreview.innerHTML = window.RichText.render(body);
    window.RichText.highlight(els.artifactPreview);
  } else els.artifactPreview.textContent = body;
}

function editArtifact(artifact = null) {
  state.selectedArtifactId = artifact?.id || null;
  els.artifactEmpty.hidden = true;
  els.artifactForm.hidden = false;
  els.artifactTitle.value = artifact?.title || "";
  els.artifactKind.value = artifact?.kind || "plan";
  els.artifactBody.value = artifact?.body || "";
  renderArtifactPreview();
  renderCreation();
  requestAnimationFrame(() => els.artifactTitle.focus());
}

function renderCreation() {
  renderTaskTemplates();
  els.artifactList.replaceChildren();
  for (const artifact of state.creation.artifacts || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.toggle("active", artifact.id === state.selectedArtifactId);
    button.setAttribute("role", "listitem");
    const title = document.createElement("strong");
    title.textContent = artifact.title;
    const meta = document.createElement("span");
    meta.textContent = `${artifact.kind} · ${artifactDate(artifact.updatedAt)}`;
    button.append(title, meta);
    button.addEventListener("click", () => editArtifact(artifact));
    els.artifactList.append(button);
  }
  if (!els.artifactList.childElementCount) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "No Canvas artifacts yet.";
    els.artifactList.append(empty);
  }
  const current = selectedArtifact();
  if (current && !els.artifactForm.hidden && document.activeElement !== els.artifactTitle && document.activeElement !== els.artifactBody) {
    els.artifactTitle.value = current.title;
    els.artifactKind.value = current.kind;
    els.artifactBody.value = current.body;
    renderArtifactPreview();
  }
  if (!current && els.artifactForm.hidden) els.artifactEmpty.hidden = false;

  els.templateList.replaceChildren();
  for (const template of state.creation.templates || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.toggle("active", template.id === state.selectedTemplateId);
    button.setAttribute("role", "listitem");
    const title = document.createElement("strong");
    title.textContent = template.name;
    const meta = document.createElement("span");
    meta.textContent = `${template.builtin ? "built in" : "custom"} · ${template.isolation}`;
    button.append(title, meta);
    button.addEventListener("click", () => editTemplate(template));
    els.templateList.append(button);
  }
}

async function saveCurrentArtifact() {
  const title = els.artifactTitle.value.trim() || "Untitled artifact";
  state.creation = await api.saveArtifact({
    id: state.selectedArtifactId,
    title,
    kind: els.artifactKind.value,
    body: els.artifactBody.value,
    repository: state.activeThread?.cwd || null,
  });
  const saved = state.selectedArtifactId
    ? state.creation.artifacts.find((artifact) => artifact.id === state.selectedArtifactId)
    : state.creation.artifacts[0];
  state.selectedArtifactId = saved?.id || null;
  els.studioStatus.textContent = "Artifact saved locally";
  renderCreation();
  return saved;
}

function editTemplate(template = null) {
  state.selectedTemplateId = template?.id || null;
  els.templateId.value = template?.builtin ? "" : template?.id || "";
  els.templateName.value = template?.name || "";
  els.templateDescription.value = template?.description || "";
  els.templatePrompt.value = template?.prompt || "";
  els.templateIsolation.value = template?.isolation || "worktree";
  els.templateBaseRef.value = template?.baseRef || "HEAD";
  els.templateEffort.value = template?.effort || "";
  els.deleteTemplate.hidden = !template || template.builtin;
  for (const button of els.templateList.querySelectorAll("button")) button.classList.toggle("active", button.querySelector("strong")?.textContent === template?.name);
  requestAnimationFrame(() => els.templateName.focus());
}

function searchResultCard(result) {
  const card = document.createElement("article");
  card.className = "workspace-search-result";
  card.setAttribute("role", "listitem");
  const kind = document.createElement("span");
  kind.className = "result-kind";
  kind.textContent = result.kind;
  const main = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = result.title;
  const detail = document.createElement("p");
  detail.textContent = result.detail;
  main.append(title, detail);
  const open = document.createElement("button");
  open.type = "button";
  open.className = "secondary-button";
  open.textContent = result.kind === "file" ? "Show file" : "Open";
  open.addEventListener("click", async () => {
    if (result.kind === "thread" && result.threadId) {
      hideDialog(els.studioOverlay, els.studioButton);
      await resumeThread(result.threadId);
    } else if (result.kind === "task") {
      const task = state.tasks.tasks.find((entry) => entry.id === result.taskId);
      if (task?.threadId) {
        hideDialog(els.studioOverlay, els.studioButton);
        await resumeThread(task.threadId);
      } else {
        hideDialog(els.studioOverlay, els.studioButton);
        await openTasks();
      }
    } else if (result.kind === "artifact") {
      const artifact = state.creation.artifacts.find((entry) => entry.id === result.artifactId);
      if (artifact) { setStudioTab("canvas"); editArtifact(artifact); }
    } else if (result.kind === "file") await api.showSearchFile({ repository: result.repository, relativePath: result.relativePath });
  });
  card.append(kind, main, open);
  return card;
}

async function runWorkspaceSearch() {
  const query = els.workspaceSearchInput.value.trim();
  els.workspaceSearchButton.disabled = true;
  els.workspaceSearchSummary.textContent = "Searching local work…";
  try {
    state.searchResults = await api.searchWorkspace({ query, repository: state.activeThread?.cwd || null });
    els.workspaceSearchResults.replaceChildren();
    for (const result of state.searchResults) els.workspaceSearchResults.append(searchResultCard(result));
    if (!state.searchResults.length) {
      const empty = document.createElement("p");
      empty.className = "empty-list";
      empty.textContent = "No matching local work was found.";
      els.workspaceSearchResults.append(empty);
    }
    const countByKind = new Map();
    for (const result of state.searchResults) countByKind.set(result.kind, (countByKind.get(result.kind) || 0) + 1);
    const counts = [...countByKind].map(([kind, count]) => `${count} ${kind}${count === 1 ? "" : "s"}`);
    els.workspaceSearchSummary.textContent = counts.length ? `${state.searchResults.length} results · ${counts.join(" · ")}` : "No results.";
  } finally {
    els.workspaceSearchButton.disabled = false;
  }
}

async function openStudio(tab = state.studioTab) {
  setStudioTab(tab);
  renderCreation();
  showDialog(els.studioOverlay, tab === "search" ? els.workspaceSearchInput : els.closeStudio);
  try {
    state.creation = await api.creationState();
    renderCreation();
    if (tab === "voice") await loadVoiceCapability();
  } catch (error) { showError(error); }
}

function renderVoice() {
  const available = Boolean(state.voiceCapability?.available && state.activeThread && state.account && state.connected && !state.activeTurnId);
  const active = Boolean(voiceCapture.mode);
  els.dictation.disabled = !available;
  els.studioDictation.disabled = !available || active;
  els.voiceConversation.disabled = !available || active;
  els.voiceSelect.disabled = !available || active;
  els.stopVoice.hidden = !active;
  els.voiceOrb.classList.toggle("active", active);
  els.dictation.classList.toggle("voice-active", active);
  els.dictation.setAttribute("aria-label", active ? "Stop voice" : "Start voice dictation");
  els.dictation.title = available ? (active ? "Stop voice" : "Start voice dictation") : state.voiceCapability?.reason || "Realtime voice is unavailable";
  if (!state.voiceCapability?.available) {
    els.voiceTitle.textContent = "Voice is unavailable";
    els.voiceDescription.textContent = state.voiceCapability?.reason || "This installed Codex CLI does not advertise the realtime voice interface.";
  } else {
    els.voiceTitle.textContent = active ? (voiceCapture.mode === "dictation" ? "Listening for dictation" : "Voice conversation active") : "Talk through the work";
    els.voiceDescription.textContent = state.voiceCapability.experimental
      ? "Realtime voice is experimental and depends on your Codex account, rollout, and workspace settings."
      : "Voice is ready.";
  }
}

async function loadVoiceCapability() {
  try {
    state.voiceCapability = await api.voiceState();
    const selected = els.voiceSelect.value;
    els.voiceSelect.replaceChildren();
    for (const voice of state.voiceCapability.voices || []) els.voiceSelect.add(new Option(voice[0].toUpperCase() + voice.slice(1), voice));
    els.voiceSelect.value = (state.voiceCapability.voices || []).includes(selected) ? selected : state.voiceCapability.defaultVoice || state.voiceCapability.voices?.[0] || "";
  } catch (error) {
    state.voiceCapability = { available: false, reason: error.message };
  }
  renderVoice();
}

function pcmBase64(samples) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

async function startVoiceCapture(mode) {
  if (!state.activeThread || voiceCapture.mode) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  try {
    await api.startVoice({ threadId: state.activeThread.id, mode, voice: mode === "conversation" ? els.voiceSelect.value || null : null });
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const silent = context.createGain();
    silent.gain.value = 0;
    voiceCapture.stream = stream;
    voiceCapture.context = context;
    voiceCapture.source = source;
    voiceCapture.processor = processor;
    voiceCapture.mode = mode;
    voiceCapture.transcript = "";
    voiceCapture.basePrompt = els.prompt.value.trim();
    voiceCapture.chunkQueue = Promise.resolve();
    voiceCapture.playbackAt = context.currentTime;
    processor.onaudioprocess = (event) => {
      if (!voiceCapture.mode || !state.activeThread) return;
      const samples = new Float32Array(event.inputBuffer.getChannelData(0));
      const payload = { threadId: state.activeThread.id, audio: { data: pcmBase64(samples), sampleRate: context.sampleRate, numChannels: 1, samplesPerChannel: samples.length } };
      voiceCapture.chunkQueue = voiceCapture.chunkQueue.then(() => api.appendVoiceAudio(payload)).catch((error) => {
        showError(error);
        void stopVoiceCapture({ notifyServer: false });
      });
    };
    source.connect(processor);
    processor.connect(silent);
    silent.connect(context.destination);
    els.voiceTranscript.textContent = mode === "dictation" ? "Listening… your transcript will appear here." : "Conversation started. Speak naturally to coordinate the work.";
    renderVoice();
  } catch (error) {
    for (const track of stream.getTracks()) track.stop();
    throw error;
  }
}

async function stopVoiceCapture({ notifyServer = true } = {}) {
  const threadId = state.activeThread?.id;
  voiceCapture.processor?.disconnect();
  voiceCapture.source?.disconnect();
  for (const track of voiceCapture.stream?.getTracks() || []) track.stop();
  await voiceCapture.chunkQueue.catch(() => {});
  if (notifyServer && threadId) await api.stopVoice(threadId).catch(showError);
  await voiceCapture.context?.close().catch(() => {});
  voiceCapture.stream = null;
  voiceCapture.context = null;
  voiceCapture.source = null;
  voiceCapture.processor = null;
  voiceCapture.mode = null;
  els.voiceTranscript.textContent = voiceCapture.transcript || "Voice session ended.";
  renderVoice();
  if (!els.prompt.disabled && voiceCapture.transcript) els.prompt.focus();
}

function acceptRealtimeTranscript(event) {
  if (!voiceCapture.mode || event.threadId !== state.activeThread?.id || event.role !== "user") return;
  voiceCapture.transcript = event.phase === "done" ? event.text : `${voiceCapture.transcript}${event.text}`;
  els.voiceTranscript.textContent = voiceCapture.transcript || "Listening…";
  if (voiceCapture.mode === "dictation") {
    els.prompt.value = [voiceCapture.basePrompt, voiceCapture.transcript].filter(Boolean).join(voiceCapture.basePrompt ? "\n" : "");
    els.prompt.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function playRealtimeAudio(audio) {
  const context = voiceCapture.context;
  if (!context || voiceCapture.mode !== "conversation") return;
  const binary = atob(audio.data);
  const view = new DataView(Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer);
  const frames = Math.floor(view.byteLength / 2 / audio.numChannels);
  if (!frames) return;
  const buffer = context.createBuffer(audio.numChannels, frames, audio.sampleRate);
  for (let channel = 0; channel < audio.numChannels; channel += 1) {
    const output = buffer.getChannelData(channel);
    for (let frame = 0; frame < frames; frame += 1) output[frame] = view.getInt16((frame * audio.numChannels + channel) * 2, true) / 0x8000;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  const startAt = Math.max(context.currentTime + 0.02, voiceCapture.playbackAt);
  source.start(startAt);
  voiceCapture.playbackAt = startAt + buffer.duration;
}

function reviewEmpty(container, message) {
  container.replaceChildren();
  const empty = document.createElement("p");
  empty.className = "empty-list";
  empty.textContent = message;
  container.append(empty);
}

function reviewPill(label, value, tone = "") {
  const pill = document.createElement("span");
  pill.className = `review-pill ${tone}`.trim();
  const strong = document.createElement("strong");
  strong.textContent = String(value);
  pill.append(strong, ` ${label}`);
  return pill;
}

function formatReviewDate(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? taskAge(timestamp) : "";
}

function setReviewTab(tab) {
  state.reviewTab = ["changes", "ship", "github", "policy"].includes(tab) ? tab : "changes";
  for (const button of els.reviewTabs.querySelectorAll("[data-review-tab]")) {
    const active = button.dataset.reviewTab === state.reviewTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  }
  for (const panel of document.querySelectorAll("[data-review-panel]")) panel.hidden = panel.dataset.reviewPanel !== state.reviewTab;
}

async function decideReviewHunk(hunk, decision, button) {
  if (!state.activeThread) return;
  button.disabled = true;
  try {
    const result = await api.decideReviewHunk({ cwd: state.activeThread.cwd, hunkId: hunk.id, decision });
    state.review = result.snapshot;
    renderReview();
    await refreshGit();
    if (!result.cancelled) toast(decision === "stage" ? "Hunk staged" : "Hunk rejected");
  } catch (error) {
    button.disabled = false;
    showError(error);
  }
}

function renderReviewFile(file, { staged = false } = {}) {
  const card = document.createElement("article");
  card.className = `review-file${staged ? " staged" : ""}`;
  const heading = document.createElement("header");
  const title = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = file.path;
  const stats = document.createElement("span");
  stats.textContent = `+${file.additions} −${file.deletions} · ${file.hunks.length} hunk${file.hunks.length === 1 ? "" : "s"}`;
  title.append(name, stats);
  const stateLabel = document.createElement("span");
  stateLabel.className = `review-file-state ${staged ? "staged" : "working"}`;
  stateLabel.textContent = staged ? "staged" : file.binary ? "binary" : "working";
  heading.append(title, stateLabel);
  card.append(heading);

  if (file.binary) {
    const message = document.createElement("p");
    message.className = "review-binary";
    message.textContent = "Binary changes are reviewed at file level.";
    card.append(message);
  }
  for (const hunk of file.hunks) {
    const details = document.createElement("details");
    details.className = "review-hunk";
    details.open = !staged;
    const summary = document.createElement("summary");
    const label = document.createElement("code");
    label.textContent = hunk.header;
    const delta = document.createElement("span");
    delta.textContent = `+${hunk.additions} −${hunk.deletions}`;
    summary.append(label, delta);
    const patch = document.createElement("pre");
    patch.textContent = hunk.lines.join("\n");
    details.append(summary, patch);
    if (!staged) {
      const actions = document.createElement("div");
      actions.className = "review-hunk-actions";
      const reject = document.createElement("button");
      reject.type = "button";
      reject.className = "danger-button";
      reject.textContent = "Reject hunk…";
      reject.addEventListener("click", () => decideReviewHunk(hunk, "reject", reject));
      const accept = document.createElement("button");
      accept.type = "button";
      accept.className = "primary-action";
      accept.textContent = "Accept & stage";
      accept.addEventListener("click", () => decideReviewHunk(hunk, "stage", accept));
      actions.append(reject, accept);
      details.append(actions);
    }
    card.append(details);
  }
  const fileActions = document.createElement("div");
  fileActions.className = "review-file-actions";
  if (staged) {
    const unstage = document.createElement("button");
    unstage.type = "button";
    unstage.className = "secondary-button";
    unstage.textContent = "Unstage file";
    unstage.addEventListener("click", async () => {
      unstage.disabled = true;
      try {
        await api.gitUnstage({ cwd: state.activeThread.cwd, paths: [file.path] });
        await loadReview();
        await refreshGit();
      } catch (error) { unstage.disabled = false; showError(error); }
    });
    fileActions.append(unstage);
  } else if (file.binary || !file.hunks.length) {
    const reject = document.createElement("button");
    reject.type = "button";
    reject.className = "danger-button";
    reject.textContent = "Discard file…";
    reject.addEventListener("click", async () => {
      reject.disabled = true;
      try {
        const result = await api.gitDiscard({ cwd: state.activeThread.cwd, paths: [file.path] });
        if (!result.cancelled) { await loadReview(); await refreshGit(); }
        else reject.disabled = false;
      } catch (error) { reject.disabled = false; showError(error); }
    });
    const stage = document.createElement("button");
    stage.type = "button";
    stage.className = "primary-action";
    stage.textContent = "Accept & stage file";
    stage.addEventListener("click", async () => {
      stage.disabled = true;
      try {
        await api.gitStage({ cwd: state.activeThread.cwd, paths: [file.path] });
        await loadReview();
        await refreshGit();
      } catch (error) { stage.disabled = false; showError(error); }
    });
    fileActions.append(reject, stage);
  }
  if (fileActions.childElementCount) card.append(fileActions);
  return card;
}

function contextLink(item, subtitle) {
  const card = document.createElement(item.url ? "button" : "article");
  card.className = "review-context-card";
  if (item.url) {
    card.type = "button";
    card.addEventListener("click", () => api.openExternal(item.url).catch(showError));
  }
  const heading = document.createElement("strong");
  heading.textContent = item.title || item.name;
  const detail = document.createElement("span");
  detail.textContent = subtitle;
  card.append(heading, detail);
  return card;
}

function renderReview() {
  const snapshot = state.review;
  els.reviewButton.disabled = !state.activeThread;
  setReviewTab(state.reviewTab);
  if (!snapshot) {
    els.reviewCopy.textContent = state.activeThread ? "Loading review context…" : "Open a project to review changes, collect test evidence, and prepare a draft pull request.";
    els.reviewSummary.replaceChildren();
    for (const container of [els.reviewChanges, els.reviewChecks, els.reviewEvidence, els.reviewIssues, els.reviewPulls, els.reviewRuns, els.reviewComments, els.reviewPolicy]) reviewEmpty(container, "No review context loaded.");
    return;
  }

  const { review, github: githubState, policy, checks } = snapshot;
  const pending = review.counts.workingHunks;
  els.reviewBadge.hidden = !pending;
  els.reviewBadge.textContent = String(pending);
  els.reviewCopy.textContent = `${basename(review.repository)} · ${review.branch} · review before publishing`;
  els.reviewSummary.replaceChildren(
    reviewPill("working hunks", review.counts.workingHunks, review.counts.workingHunks ? "warn" : "good"),
    reviewPill("staged hunks", review.counts.stagedHunks, review.counts.stagedHunks ? "good" : ""),
    reviewPill("files", review.counts.files),
    reviewPill("ahead", review.ahead),
    reviewPill("behind", review.behind, review.behind ? "warn" : ""),
  );

  els.reviewChanges.replaceChildren();
  if (!review.working.length && !review.staged.length) reviewEmpty(els.reviewChanges, "The working tree is clean.");
  for (const file of review.working) els.reviewChanges.append(renderReviewFile(file));
  if (review.staged.length) {
    const stagedHeading = document.createElement("h4");
    stagedHeading.className = "review-subheading";
    stagedHeading.textContent = "Accepted and staged";
    els.reviewChanges.append(stagedHeading);
    for (const file of review.staged) els.reviewChanges.append(renderReviewFile(file, { staged: true }));
  }

  els.reviewChecks.replaceChildren();
  if (!checks.length) reviewEmpty(els.reviewChecks, "No supported repository check was discovered.");
  for (const check of checks) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = `Run ${check.label}`;
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = `Running ${check.label}…`;
      try {
        state.review = await api.runReviewCheck({ cwd: state.activeThread.cwd, checkId: check.id });
        renderReview();
        toast(`${check.label} finished`);
      } catch (error) { button.disabled = false; button.textContent = `Run ${check.label}`; showError(error); }
    });
    els.reviewChecks.append(button);
  }
  els.reviewEvidence.replaceChildren();
  if (!review.evidence.length) reviewEmpty(els.reviewEvidence, "Run a check to attach evidence to this review.");
  for (const evidence of [...review.evidence].reverse()) {
    const details = document.createElement("details");
    details.className = `review-evidence ${evidence.passed ? "passed" : "failed"}`;
    const summary = document.createElement("summary");
    const label = document.createElement("strong");
    label.textContent = evidence.label;
    const result = document.createElement("span");
    result.textContent = `${evidence.passed ? "passed" : "failed"} · ${(evidence.durationMs / 1000).toFixed(1)}s`;
    summary.append(label, result);
    const output = document.createElement("pre");
    output.textContent = evidence.output || evidence.error || "No output.";
    details.append(summary, output);
    els.reviewEvidence.append(details);
  }

  els.reviewPushStatus.textContent = review.branch === "detached"
    ? "Create a branch before pushing."
    : review.upstream ? `${review.branch} tracks ${review.upstream}.` : `${review.branch} has no upstream yet.`;
  els.reviewPush.disabled = review.branch === "detached";
  els.reviewPrBase.value = els.reviewPrBase.value || githubState?.repository?.defaultBranch || "main";
  els.reviewPrButton.disabled = !githubState?.available || review.branch === "detached";

  els.githubReviewStatus.replaceChildren();
  if (githubState?.available) {
    els.githubReviewStatus.append(
      reviewPill(githubState.repository.visibility, githubState.repository.name, "good"),
      reviewPill("permission", githubState.repository.viewerPermission),
      reviewPill("CLI", githubState.cliVersion || "ready"),
    );
  } else {
    const message = document.createElement("div");
    message.className = "review-github-unavailable";
    const strong = document.createElement("strong");
    strong.textContent = githubState?.reason || "GitHub context is unavailable.";
    const detail = document.createElement("span");
    detail.textContent = githubState?.error || "Install and authenticate GitHub CLI, then refresh.";
    message.append(strong, detail);
    els.githubReviewStatus.append(message);
  }

  const githubLists = [
    [els.reviewIssues, githubState?.issues || [], (item) => contextLink({ ...item, title: `#${item.number} ${item.title}` }, [item.state, item.labels.join(", "), formatReviewDate(item.updatedAt)].filter(Boolean).join(" · "))],
    [els.reviewPulls, githubState?.pulls || [], (item) => contextLink({ ...item, title: `#${item.number} ${item.title}` }, [item.draft ? "draft" : item.state, `${item.head} → ${item.base}`, item.reviewDecision, item.checks.length ? `${item.checks.filter((check) => ["SUCCESS", "success"].includes(check.conclusion)).length}/${item.checks.length} checks` : null].filter(Boolean).join(" · "))],
    [els.reviewRuns, githubState?.runs || [], (item) => contextLink(item, [item.status, item.conclusion, item.branch, formatReviewDate(item.createdAt)].filter(Boolean).join(" · "))],
    [els.reviewComments, githubState?.reviewComments || [], (item) => contextLink({ ...item, title: item.body }, [item.author, item.path && `${item.path}${item.line ? `:${item.line}` : ""}`, formatReviewDate(item.createdAt)].filter(Boolean).join(" · "))],
  ];
  for (const [container, items, factory] of githubLists) {
    container.replaceChildren();
    if (!items.length) reviewEmpty(container, githubState?.available ? "Nothing to show." : "GitHub CLI context unavailable.");
    for (const item of items) container.append(factory(item));
  }

  els.reviewPolicy.replaceChildren();
  if (policy.remote) {
    const remote = document.createElement("article");
    remote.className = "review-policy-card";
    const heading = document.createElement("strong");
    heading.textContent = policy.remote.error ? "Branch protection unavailable" : policy.remote.protected ? "Protected default branch" : "No branch protection reported";
    const detail = document.createElement("span");
    detail.textContent = policy.remote.error || [
      policy.remote.requiredChecks.length ? `${policy.remote.requiredChecks.length} required checks` : "no required checks",
      policy.remote.requiredReviews ? `${policy.remote.requiredReviews} required reviews` : "no required reviews",
      policy.remote.requireCodeOwners ? "code owners required" : null,
      policy.remote.requireConversationResolution ? "conversations must resolve" : null,
    ].filter(Boolean).join(" · ");
    remote.append(heading, detail);
    els.reviewPolicy.append(remote);
  }
  const hooks = document.createElement("article");
  hooks.className = "review-policy-card";
  const hooksHeading = document.createElement("strong");
  hooksHeading.textContent = "Git hooks path";
  const hooksPath = document.createElement("code");
  hooksPath.textContent = policy.hooksPath;
  hooks.append(hooksHeading, hooksPath);
  els.reviewPolicy.append(hooks);
  for (const file of policy.files) {
    const card = document.createElement("article");
    card.className = "review-policy-card";
    const main = document.createElement("div");
    const kind = document.createElement("strong");
    kind.textContent = file.kind;
    const filePath = document.createElement("code");
    filePath.textContent = file.path;
    main.append(kind, filePath);
    const show = document.createElement("button");
    show.type = "button";
    show.className = "secondary-button";
    show.textContent = "Show file";
    show.addEventListener("click", () => api.showReviewPolicy({ cwd: state.activeThread.cwd, policyPath: file.path }).catch(showError));
    card.append(main, show);
    els.reviewPolicy.append(card);
  }
  if (!els.reviewPolicy.childElementCount) reviewEmpty(els.reviewPolicy, "No repository policy files or branch rules were discovered.");
}

async function loadReview({ forceGitHub = false } = {}) {
  if (!state.activeThread) return;
  els.refreshReview.disabled = true;
  try {
    state.review = await api.reviewCenter({ cwd: state.activeThread.cwd, forceGitHub });
    renderReview();
  } catch (error) {
    state.review = null;
    renderReview();
    showError(error);
  } finally {
    els.refreshReview.disabled = false;
  }
}

function openReview() {
  if (!state.activeThread) {
    toast("Open a project before starting review");
    return;
  }
  state.review = null;
  renderReview();
  showDialog(els.reviewOverlay, els.closeReview);
  loadReview({ forceGitHub: true });
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
  renderTaskModels();
}
function renderThreads() {
  const renderStartedAt = performance.now();
  const query = els.threadSearch.value.trim().toLowerCase();
  const threads = state.threads.filter((thread) => `${thread.name || ""} ${thread.preview || ""} ${thread.cwd || ""}`.toLowerCase().includes(query));
  els.threadList.replaceChildren();
  if (!threads.length) { const empty = document.createElement("p"); empty.className = "empty-list"; empty.textContent = query ? "No matching threads" : "No Codex threads yet"; els.threadList.append(empty); reportRenderMetric("threadRender", renderStartedAt); return; }
  for (const thread of threads) {
    const button = document.createElement("button"); button.className = `thread-item${thread.id === state.activeThread?.id ? " active" : ""}`;
    const title = document.createElement("strong"); title.textContent = thread.name || thread.preview || "Untitled thread";
    const time = document.createElement("time"); time.textContent = relativeTime(thread.updatedAt);
    const project = document.createElement("small"); project.textContent = basename(thread.cwd);
    button.title = `${title.textContent} · ${project.textContent}`;
    if (thread.id === state.activeThread?.id) button.setAttribute("aria-current", "page");
    button.append(title, time, project); button.addEventListener("click", () => resumeThread(thread.id)); els.threadList.append(button);
  }
  reportRenderMetric("threadRender", renderStartedAt);
}
function setActiveThread(thread, turns = []) {
  state.activeThread = thread; state.turns = turns; state.activeTurnId = turns.findLast?.((turn) => turn.status === "inProgress")?.id || null; state.diff = ""; state.gitSelection = null; state.gitFileDiff = "";
  els.threadTitle.textContent = thread.name || thread.preview || "New thread"; els.projectPath.textContent = thread.cwd; els.folderName.textContent = basename(thread.cwd);
  els.home.disabled = false; els.welcome.hidden = true; els.messages.hidden = false; els.terminalButton.disabled = !protocolFeatureAvailable("terminal"); renderThreads(); renderMessages(); renderDiff(); updateComposer(); refreshGit();
  if (terminalPanelVisible()) focusProjectTerminal({ create: true });
  else renderTerminal();
}

async function showHome() {
  if (voiceCapture.mode) await stopVoiceCapture();
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
  const renderStartedAt = performance.now();
  els.messages.replaceChildren();
  for (const turn of state.turns) {
    const turnNode = document.createElement("section"); turnNode.className = "turn"; turnNode.dataset.turnId = turn.id;
    for (const item of turn.items || []) turnNode.append(itemNode(item));
    if (turn.error) { const error = document.createElement("div"); error.className = "turn-error"; error.textContent = turn.error.message || JSON.stringify(turn.error); turnNode.append(error); }
    else if (turn.status === "inProgress" && !(turn.items || []).some((item) => item.type === "agentMessage" && item.text)) { const thinking = document.createElement("div"); thinking.className = "thinking"; thinking.innerHTML = "<i></i><i></i><i></i>"; turnNode.append(thinking); }
    els.messages.append(turnNode);
  }
  requestAnimationFrame(() => { els.conversation.scrollTop = els.conversation.scrollHeight; });
  reportRenderMetric("messageRender", renderStartedAt);
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
  const renderStartedAt = performance.now();
  const files = gitFilesForView();
  if (state.gitSelection && !files.some((entry) => entry.path === state.gitSelection)) { state.gitSelection = null; state.gitFileDiff = ""; }
  const current = state.gitSelection ? state.gitFileDiff : (diffForView() || "");
  els.diffContent.textContent = current || (state.diffView === "turn" ? "No changes in the current turn." : `No ${state.diffView} changes.`);
  const changedCount = state.git?.entries?.length || [...state.diff.matchAll(/^diff --git /gm)].length;
  els.diffBadge.textContent = changedCount; els.diffSummary.textContent = `${state.git?.branch || "Repository"} · ${changedCount} change${changedCount === 1 ? "" : "s"}`;
  els.diffButton.disabled = !state.activeThread;
  els.reviewButton.disabled = !state.activeThread;
  if (!state.review) {
    els.reviewBadge.hidden = !changedCount;
    els.reviewBadge.textContent = String(changedCount);
  }
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
  reportRenderMetric("diffParse", renderStartedAt);
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
  renderVoice();
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
async function resumeThread(threadId) {
  try {
    if (voiceCapture.mode && threadId !== state.activeThread?.id) await stopVoiceCapture();
    const response = await api.resumeThread(threadId);
    setActiveThread(response.thread, response.thread.turns || []);
  } catch (error) { showError(error); }
}
async function refreshThreads() { try { const response = await api.listThreads({}); state.threads = response.data; renderThreads(); } catch (error) { showError(error); } }
async function sendTurn() {
  const text = els.prompt.value.trim(), attachments = [...state.attachments]; if ((!text && !attachments.length) || !state.activeThread || state.activeTurnId) return;
  els.prompt.value = ""; state.attachments = []; renderAttachments(); els.prompt.style.height = "auto"; updateComposer();
  try {
    const response = await api.sendTurn({ threadId: state.activeThread.id, text, attachments, model: els.model.value, effort: els.effort.value }); const turn = response.turn;
    if (!(turn.items || []).some((item) => item.type === "userMessage")) turn.items = [{ type: "userMessage", id: `local-${Date.now()}`, clientId: null, content: [...(text ? [{ type: "text", text, text_elements: [] }] : []), ...attachments.map((item) => item.kind === "image" ? { type: "localImage", path: item.path } : { type: "mention", name: item.name, path: item.path })] }, ...(turn.items || [])];
    const index = state.turns.findIndex((entry) => entry.id === turn.id); if (index === -1) state.turns.push(turn); else state.turns[index] = mergeTurnSnapshot(state.turns[index], turn);
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
  const renderStartedAt = performance.now();
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
  reportRenderMetric("terminalRender", renderStartedAt);
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
  if (method === "skills/changed") {
    state.extensions = null;
    if (!els.extensionsOverlay.hidden) loadExtensions({ forceReload: true });
    return;
  }
  if (params.threadId && params.threadId !== state.activeThread?.id) { if (["thread/name/updated", "thread/status/changed", "turn/completed"].includes(method)) refreshThreads(); return; }
  if (method === "turn/started") { state.activeTurnId = params.turn.id; const index = state.turns.findIndex((turn) => turn.id === params.turn.id); if (index === -1) state.turns.push(params.turn); else state.turns[index] = mergeTurnSnapshot(state.turns[index], params.turn); }
  else if (method === "item/started" || method === "item/completed") upsertItem(params.turnId, params.item);
  else if (method === "item/agentMessage/delta") appendItemDelta(params.turnId, params.itemId, "agentMessage", "text", params.delta);
  else if (method === "item/commandExecution/outputDelta" || method === "command/exec/outputDelta") appendItemDelta(params.turnId, params.itemId, "commandExecution", "aggregatedOutput", params.delta);
  else if (method === "item/fileChange/patchUpdated") { upsertItem(params.turnId, { type: "fileChange", id: params.itemId, changes: params.changes, status: "inProgress" }); refreshGit(); }
  else if (method === "turn/diff/updated") { state.diff = params.diff; renderDiff(); }
  else if (method === "turn/completed") { const index = state.turns.findIndex((turn) => turn.id === params.turn.id); if (index === -1) state.turns.push(params.turn); else state.turns[index] = mergeTurnSnapshot(state.turns[index], params.turn); state.activeTurnId = null; announce("Codex finished the current turn."); refreshThreads(); refreshGit(); }
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

function queueRequest(request) { state.requestQueue.push(request); announce("Codex needs your decision."); if (!state.currentRequest) showNextRequest(); }

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
    const values = {};
    if (request.method === "item/tool/requestUserInput" && action !== "deny") {
      values.answers = {};
      for (const control of els.requestQuestions.querySelectorAll("[data-question-id]")) values.answers[control.dataset.questionId] = { answers: [control.value] };
    }
    if (request.method === "mcpServer/elicitation/request" && request.params.mode !== "url" && action !== "deny") {
      values.content = {};
      for (const control of els.requestQuestions.querySelectorAll("[data-elicitation-key]")) {
        let value = control.type === "checkbox" ? control.checked : control.value;
        if (control.dataset.valueType === "number" || control.dataset.valueType === "integer") value = Number(value);
        values.content[control.dataset.elicitationKey] = value;
      }
    }
    const response = responseForRequest(request, action, values);
    if (response.openUrl) await api.openExternal(response.openUrl);
    if (response.kind === "answer") await api.answerRequest({ id: request.id, result: response.result });
    else await api.rejectRequest({ id: request.id, message: response.message });
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
  state.threads = result.threads; state.models = result.models; state.cli = result.cli || state.cli; state.compatibility = result.compatibility || state.compatibility; state.desktop = result.desktop || state.desktop; state.updates = result.updates || state.updates; state.reporting = result.reporting || state.reporting; state.tasks = result.tasks || state.tasks; state.creation = result.creation || state.creation; setConnection(true); renderAccount(result.account); renderModels(); renderThreads(); renderDesktopPreferences(); renderUpdateState(); renderReportingState(); renderTasks(); renderCreation();
  void loadVoiceCapability();
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
  else if (event.kind === "reportingState") { state.reporting = event.reporting; renderReportingState(); }
  else if (event.kind === "updateState") { state.updates = event.updates; renderUpdateState(); }
  else if (event.kind === "tasksState") { state.tasks = event.tasks; renderTasks(); }
  else if (event.kind === "creationState") { state.creation = event.creation; renderCreation(); }
  else if (event.kind === "realtimeTranscript") acceptRealtimeTranscript(event);
  else if (event.kind === "realtimeAudio") playRealtimeAudio(event.audio);
  else if (event.kind === "realtimeState") {
    if (event.phase === "error") { showError(new Error(event.error || "Realtime voice stopped")); void stopVoiceCapture({ notifyServer: false }); }
    else if (event.phase === "closed" && voiceCapture.mode) void stopVoiceCapture({ notifyServer: false });
  }
  else if (event.kind === "captureReview") {
    state.activeThread = event.thread;
    state.review = event.snapshot;
    state.reviewTab = "changes";
    renderReview();
    showDialog(els.reviewOverlay, els.closeReview);
  }
  else if (event.kind === "captureStudio") {
    state.activeThread = event.thread;
    state.creation = event.creation;
    state.voiceCapability = event.voiceCapability;
    state.searchResults = event.searchResults || [];
    renderCreation();
    setStudioTab(event.tab || "canvas");
    if (event.tab === "canvas" && state.creation.artifacts[0]) editArtifact(state.creation.artifacts[0]);
    if (event.tab === "templates" && state.creation.templates[1]) editTemplate(state.creation.templates[1]);
    if (event.tab === "search") {
      els.workspaceSearchInput.value = "creation";
      els.workspaceSearchResults.replaceChildren();
      for (const result of state.searchResults) els.workspaceSearchResults.append(searchResultCard(result));
      els.workspaceSearchSummary.textContent = `${state.searchResults.length} results · 1 thread · 1 task · 1 artifact · 1 file`;
    }
    if (event.tab === "voice") {
      els.voiceSelect.replaceChildren(...event.voiceCapability.voices.map((voice) => new Option(voice[0].toUpperCase() + voice.slice(1), voice)));
      els.voiceSelect.value = event.voiceCapability.defaultVoice;
      renderVoice();
    }
    showDialog(els.studioOverlay, els.closeStudio);
  }
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
els.extensions.addEventListener("click", openExtensions);
els.tasksButton.addEventListener("click", openTasks);
els.reviewButton.addEventListener("click", openReview);
els.studioButton.addEventListener("click", () => openStudio().catch(showError));
els.home.addEventListener("click", showHome);
els.closeAuth.addEventListener("click", () => hideDialog(els.authOverlay, els.brandMenuButton));
els.closeExtensions.addEventListener("click", () => hideDialog(els.extensionsOverlay, els.brandMenuButton));
els.closeTasks.addEventListener("click", () => hideDialog(els.tasksOverlay, els.tasksButton));
els.closeReview.addEventListener("click", () => hideDialog(els.reviewOverlay, els.reviewButton));
els.closeStudio.addEventListener("click", () => hideDialog(els.studioOverlay, els.studioButton));
for (const tab of els.studioTabs.querySelectorAll("[data-studio-tab]")) tab.addEventListener("click", () => setStudioTab(tab.dataset.studioTab));
els.studioTabs.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !event.target.matches("[data-studio-tab]")) return;
  const tabs = [...els.studioTabs.querySelectorAll("[data-studio-tab]")];
  const current = Math.max(0, tabs.indexOf(event.target));
  const target = event.key === "Home" ? 0
    : event.key === "End" ? tabs.length - 1
      : event.key === "ArrowRight" ? (current + 1) % tabs.length
        : (current - 1 + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[target].focus();
  tabs[target].click();
});
els.refreshReview.addEventListener("click", () => loadReview({ forceGitHub: true }));
for (const tab of els.reviewTabs.querySelectorAll("[data-review-tab]")) tab.addEventListener("click", () => setReviewTab(tab.dataset.reviewTab));
els.reviewTabs.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !event.target.matches("[data-review-tab]")) return;
  const tabs = [...els.reviewTabs.querySelectorAll("[data-review-tab]")];
  const current = Math.max(0, tabs.indexOf(event.target));
  const target = event.key === "Home" ? 0
    : event.key === "End" ? tabs.length - 1
      : event.key === "ArrowRight" ? (current + 1) % tabs.length
        : (current - 1 + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[target].focus();
  tabs[target].click();
});
els.reviewBranchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const branch = els.reviewBranchName.value.trim();
  if (!branch || !state.activeThread) return;
  const button = event.submitter;
  button.disabled = true;
  try {
    const result = await api.createReviewBranch({ cwd: state.activeThread.cwd, branch });
    state.review = result.snapshot;
    if (!result.cancelled) { els.reviewBranchName.value = ""; toast(`Created ${branch}`); }
    renderReview();
    await refreshGit();
  } catch (error) { showError(error); }
  finally { button.disabled = false; }
});
els.reviewCommitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = els.reviewCommitMessage.value.trim();
  if (!message || !state.activeThread) return;
  const button = event.submitter;
  button.disabled = true;
  try {
    const result = await api.gitCommit({ cwd: state.activeThread.cwd, message });
    if (!result.cancelled) {
      els.reviewCommitMessage.value = "";
      await loadReview({ forceGitHub: true });
      await refreshGit();
      toast(result.output?.split("\n")[0] || "Commit created");
    }
  } catch (error) { showError(error); }
  finally { button.disabled = false; }
});
els.reviewPush.addEventListener("click", async () => {
  if (!state.activeThread) return;
  els.reviewPush.disabled = true;
  try {
    const result = await api.pushReviewBranch({ cwd: state.activeThread.cwd, remote: "origin" });
    state.review = result.snapshot;
    renderReview();
    await refreshGit();
    if (!result.cancelled) toast("Branch pushed");
  } catch (error) { showError(error); }
  finally { els.reviewPush.disabled = false; }
});
els.reviewPrForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.activeThread) return;
  els.reviewPrButton.disabled = true;
  try {
    const result = await api.createDraftPullRequest({
      cwd: state.activeThread.cwd,
      title: els.reviewPrTitle.value,
      body: els.reviewPrBody.value,
      base: els.reviewPrBase.value,
    });
    state.review = result.snapshot;
    renderReview();
    if (!result.cancelled) {
      toast("Draft pull request created");
      if (result.result?.url) await api.openExternal(result.result.url);
    }
  } catch (error) { showError(error); }
  finally { els.reviewPrButton.disabled = !state.review?.github?.available || state.review?.review?.branch === "detached"; }
});
els.copyTaskSummary.addEventListener("click", async () => { try { await api.copyTaskSummary(); toast("Redacted task summary copied"); } catch (error) { showError(error); } });
els.copyShareableDiagnostics.addEventListener("click", async () => { try { await api.copyShareableDiagnostics(); toast("Shareable diagnostics copied"); } catch (error) { showError(error); } });
for (const button of [els.newArtifact, els.newArtifactEmpty]) button.addEventListener("click", () => editArtifact());
els.artifactBody.addEventListener("input", renderArtifactPreview);
els.artifactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.saveArtifact.disabled = true;
  try { await saveCurrentArtifact(); toast("Artifact saved locally"); }
  catch (error) { showError(error); }
  finally { els.saveArtifact.disabled = false; }
});
els.attachArtifact.addEventListener("click", async () => {
  els.attachArtifact.disabled = true;
  try {
    const artifact = await saveCurrentArtifact();
    if (!artifact) return;
    addAttachments([await api.attachArtifact(artifact.id)]);
    hideDialog(els.studioOverlay, els.studioButton);
    els.prompt.focus();
    toast("Artifact attached to the prompt");
  } catch (error) { showError(error); }
  finally { els.attachArtifact.disabled = false; }
});
els.exportArtifact.addEventListener("click", async () => {
  els.exportArtifact.disabled = true;
  try {
    const artifact = await saveCurrentArtifact();
    const filePath = artifact ? await api.exportArtifact(artifact.id) : null;
    if (filePath) toast(`Artifact exported to ${filePath}`);
  } catch (error) { showError(error); }
  finally { els.exportArtifact.disabled = false; }
});
els.deleteArtifact.addEventListener("click", async () => {
  if (!state.selectedArtifactId) return;
  els.deleteArtifact.disabled = true;
  try {
    const result = await api.deleteArtifact(state.selectedArtifactId);
    state.creation = result.creation;
    if (!result.cancelled) {
      state.selectedArtifactId = null;
      els.artifactForm.hidden = true;
      els.artifactEmpty.hidden = false;
      toast("Artifact deleted");
    }
    renderCreation();
  } catch (error) { showError(error); }
  finally { els.deleteArtifact.disabled = false; }
});
els.workspaceSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runWorkspaceSearch().catch(showError);
});
els.newTemplate.addEventListener("click", () => editTemplate());
els.templateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    const currentId = els.templateId.value || null;
    state.creation = await api.saveTaskTemplate({
      id: currentId,
      name: els.templateName.value,
      description: els.templateDescription.value,
      prompt: els.templatePrompt.value,
      isolation: els.templateIsolation.value,
      baseRef: els.templateBaseRef.value || "HEAD",
      effort: els.templateEffort.value || null,
    });
    const saved = currentId
      ? state.creation.templates.find((template) => template.id === currentId)
      : state.creation.templates.find((template) => !template.builtin && template.name === els.templateName.value.trim());
    editTemplate(saved || null);
    renderCreation();
    toast("Task template saved");
  } catch (error) { showError(error); }
  finally { button.disabled = false; }
});
els.deleteTemplate.addEventListener("click", async () => {
  if (!state.selectedTemplateId) return;
  els.deleteTemplate.disabled = true;
  try {
    const result = await api.deleteTaskTemplate(state.selectedTemplateId);
    state.creation = result.creation;
    if (!result.cancelled) { editTemplate(); toast("Task template deleted"); }
    renderCreation();
  } catch (error) { showError(error); }
  finally { els.deleteTemplate.disabled = false; }
});
els.applyTaskTemplate.addEventListener("click", () => {
  const template = state.creation.templates.find((entry) => entry.id === els.taskTemplate.value);
  if (template) { applyTaskTemplate(template); toast(`Applied ${template.name}`); }
});
els.saveTaskTemplate.addEventListener("click", async () => {
  hideDialog(els.tasksOverlay, els.tasksButton);
  await openStudio("templates");
  editTemplate({
    name: els.taskTitle.value || "Repository workflow",
    description: "",
    prompt: els.taskPrompt.value,
    isolation: els.taskIsolation.value,
    baseRef: els.taskBaseRef.value || "HEAD",
    effort: els.taskEffort.value || null,
  });
});
els.dictation.addEventListener("click", () => (voiceCapture.mode ? stopVoiceCapture() : startVoiceCapture("dictation")).catch(showError));
els.studioDictation.addEventListener("click", () => startVoiceCapture("dictation").catch(showError));
els.voiceConversation.addEventListener("click", () => startVoiceCapture("conversation").catch(showError));
els.stopVoice.addEventListener("click", () => stopVoiceCapture().catch(showError));
els.refreshExtensions.addEventListener("click", () => loadExtensions({ forceReload: true }));
els.chooseTaskRepository.addEventListener("click", async () => {
  try {
    const folder = await api.chooseFolder();
    if (folder) els.taskRepository.value = folder;
  } catch (error) { showError(error); }
});
els.taskIsolation.addEventListener("change", () => {
  els.taskBaseRef.disabled = els.taskIsolation.value !== "worktree";
});
els.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  queueBackgroundTask().catch(showError);
});
els.shortcutSelect.addEventListener("change", () => saveDesktopPreferences({ quickPromptShortcut: els.shortcutSelect.value || null }));
els.trayEnabled.addEventListener("change", () => saveDesktopPreferences({ trayEnabled: els.trayEnabled.checked }));
els.closeToTray.addEventListener("change", () => saveDesktopPreferences({ closeToTray: els.closeToTray.checked }));
els.launchAtLogin.addEventListener("change", () => saveDesktopPreferences({ launchAtLogin: els.launchAtLogin.checked }));
els.textScale.addEventListener("change", () => saveDesktopPreferences({ textScale: Number(els.textScale.value) }));
els.reduceMotion.addEventListener("change", () => saveDesktopPreferences({ reduceMotion: els.reduceMotion.checked }));
els.highContrast.addEventListener("change", () => saveDesktopPreferences({ highContrast: els.highContrast.checked }));
els.screenReaderMode.addEventListener("change", () => saveDesktopPreferences({ screenReaderMode: els.screenReaderMode.checked }));
els.notifyTurnComplete.addEventListener("change", () => saveDesktopPreferences({ notifyTurnComplete: els.notifyTurnComplete.checked }));
els.notifyApproval.addEventListener("change", () => saveDesktopPreferences({ notifyApproval: els.notifyApproval.checked }));
els.notifyTerminal.addEventListener("change", () => saveDesktopPreferences({ notifyTerminal: els.notifyTerminal.checked }));
els.updateChannel.addEventListener("change", () => saveUpdatePreferences({ channel: els.updateChannel.value }));
els.autoCheckUpdates.addEventListener("change", () => saveUpdatePreferences({ autoCheck: els.autoCheckUpdates.checked }));
els.checkUpdates.addEventListener("click", () => runUpdateAction("check"));
els.downloadUpdate.addEventListener("click", () => runUpdateAction("download"));
els.installUpdate.addEventListener("click", () => runUpdateAction("install"));
els.viewReleases.addEventListener("click", () => api.openReleases().catch(showError));
els.reportingEnabled.addEventListener("change", async () => {
  try {
    state.reporting = await api.setReportingPreferences({ enabled: els.reportingEnabled.checked });
    renderReportingState();
  } catch (error) { showError(error); renderReportingState(); }
});
els.copyCompatibilityReport.addEventListener("click", async () => {
  try { await api.copyCompatibilityReport(); toast("Bounded compatibility report copied"); }
  catch (error) { showError(error); }
});
els.authDocs.addEventListener("click", () => api.openExternal("https://developers.openai.com/codex/cli/"));
els.retryConnection.addEventListener("click", async () => { try { applyBootstrap(await api.bootstrap()); toast("Codex connected"); } catch (error) { state.connectionError = error.message; showError(error); renderAuth(); } });
els.chooseCli.addEventListener("click", async () => { try { const result = await api.chooseCodexCli(); if (result) { applyBootstrap(result); toast("Codex CLI connected"); } } catch (error) { state.connectionError = error.message; showError(error); renderAuth(); } });
els.signIn.addEventListener("click", async () => { try { state.loginPending = true; renderAuth(); await api.loginChatGPT(); } catch (error) { state.loginPending = false; showError(error); renderAuth(); } });
els.logout.addEventListener("click", async () => { try { renderAccount(await api.logout()); toast("Signed out of Codex"); } catch (error) { showError(error); } });
els.more.addEventListener("click", openDiagnostics); els.closeDiagnostics.addEventListener("click", () => hideDialog(els.diagnosticsOverlay, els.more));
els.copyDiagnostics.addEventListener("click", async () => { try { await api.copyDiagnostics(); toast("Diagnostics copied"); } catch (error) { showError(error); } });
els.exportDiagnostics.addEventListener("click", async () => { try { const filePath = await api.exportDiagnostics(); if (filePath) toast(`Diagnostics exported to ${filePath}`); } catch (error) { showError(error); } });
els.showLog.addEventListener("click", () => api.showLogFile().catch(showError));
for (const overlay of [els.tasksOverlay, els.reviewOverlay, els.studioOverlay, els.authOverlay, els.extensionsOverlay, els.screenshotOverlay, els.cameraOverlay, els.diagnosticsOverlay]) {
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
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "b") { event.preventDefault(); openTasks(); }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "r") { event.preventDefault(); openReview(); }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") { event.preventDefault(); openStudio("search").catch(showError); }
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
