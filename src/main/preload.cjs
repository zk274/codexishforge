const { contextBridge, ipcRenderer, webFrame, webUtils } = require("electron");

const textScales = new Set([1, 1.1, 1.25, 1.5]);

contextBridge.exposeInMainWorld("codexDesktop", {
  bootstrap: () => ipcRenderer.invoke("codex:bootstrap"),
  cliStatus: () => ipcRenderer.invoke("codex:cliStatus"),
  chooseCodexCli: () => ipcRenderer.invoke("codex:chooseCli"),
  loginChatGPT: () => ipcRenderer.invoke("codex:loginChatGPT"),
  readAccount: () => ipcRenderer.invoke("codex:readAccount"),
  logout: () => ipcRenderer.invoke("codex:logout"),
  chooseFolder: () => ipcRenderer.invoke("desktop:chooseFolder"),
  chooseAttachments: () => ipcRenderer.invoke("desktop:chooseAttachments"),
  prepareAttachments: (paths) => ipcRenderer.invoke("desktop:prepareAttachments", paths),
  clipboardImage: () => ipcRenderer.invoke("desktop:clipboardImage"),
  captureSources: () => ipcRenderer.invoke("desktop:captureSources"),
  captureSource: (sourceId) => ipcRenderer.invoke("desktop:captureSource", sourceId),
  captureSourceRegion: (params) => ipcRenderer.invoke("desktop:captureSourceRegion", params),
  saveCameraFrame: (dataUrl) => ipcRenderer.invoke("desktop:saveCameraFrame", dataUrl),
  notifyTerminal: (payload) => ipcRenderer.invoke("desktop:notifyTerminal", payload),
  desktopPreferences: () => ipcRenderer.invoke("desktop:getPreferences"),
  deepLinksReady: () => ipcRenderer.invoke("desktop:deepLinksReady"),
  updateDesktopPreferences: (updates) => ipcRenderer.invoke("desktop:updatePreferences", updates),
  taskState: () => ipcRenderer.invoke("tasks:get"),
  createTask: (payload) => ipcRenderer.invoke("tasks:create", payload),
  cancelTask: (taskId) => ipcRenderer.invoke("tasks:cancel", taskId),
  retryTask: (taskId) => ipcRenderer.invoke("tasks:retry", taskId),
  dismissTaskInbox: (inboxId) => ipcRenderer.invoke("tasks:dismissInbox", inboxId),
  showTaskWorktree: (taskId) => ipcRenderer.invoke("tasks:showWorktree", taskId),
  extensionInventory: (options) => ipcRenderer.invoke("extensions:get", options),
  setExtensionEnabled: (payload) => ipcRenderer.invoke("extensions:setEnabled", payload),
  showCodexConfig: (filePath) => ipcRenderer.invoke("extensions:showConfig", filePath),
  setTextScale: (value) => {
    const factor = Number(value);
    if (!textScales.has(factor)) throw new TypeError("Unsupported text scale");
    webFrame.setZoomFactor(factor);
    return factor;
  },
  updateState: () => ipcRenderer.invoke("updates:getState"),
  setUpdatePreferences: (preferences) => ipcRenderer.invoke("updates:setPreferences", preferences),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  openReleases: () => ipcRenderer.invoke("updates:openReleases"),
  pathForFile: (file) => webUtils.getPathForFile(file),
  gitStatus: (cwd) => ipcRenderer.invoke("git:status", cwd),
  gitDiff: (params) => ipcRenderer.invoke("git:diff", params),
  gitStage: (params) => ipcRenderer.invoke("git:stage", params),
  gitUnstage: (params) => ipcRenderer.invoke("git:unstage", params),
  gitDiscard: (params) => ipcRenderer.invoke("git:discard", params),
  gitCommit: (params) => ipcRenderer.invoke("git:commit", params),
  startTerminal: (params) => ipcRenderer.invoke("terminal:start", params),
  writeTerminal: (params) => ipcRenderer.invoke("terminal:write", params),
  resizeTerminal: (params) => ipcRenderer.invoke("terminal:resize", params),
  killTerminal: (processHandle) => ipcRenderer.invoke("terminal:kill", processHandle),
  companionContext: () => ipcRenderer.invoke("companion:context"),
  companionSubmit: (text) => ipcRenderer.invoke("companion:submit", text),
  diagnostics: () => ipcRenderer.invoke("diagnostics:get"),
  copyDiagnostics: () => ipcRenderer.invoke("diagnostics:copy"),
  exportDiagnostics: () => ipcRenderer.invoke("diagnostics:export"),
  showLogFile: () => ipcRenderer.invoke("diagnostics:showLog"),
  listThreads: (params) => ipcRenderer.invoke("codex:listThreads", params),
  startThread: (params) => ipcRenderer.invoke("codex:startThread", params),
  resumeThread: (threadId) => ipcRenderer.invoke("codex:resumeThread", threadId),
  showHome: () => ipcRenderer.invoke("codex:showHome"),
  sendTurn: (params) => ipcRenderer.invoke("codex:sendTurn", params),
  interruptTurn: (params) => ipcRenderer.invoke("codex:interruptTurn", params),
  answerRequest: (params) => ipcRenderer.invoke("codex:answerRequest", params),
  rejectRequest: (params) => ipcRenderer.invoke("codex:rejectRequest", params),
  openExternal: (url) => ipcRenderer.invoke("desktop:openExternal", url),
  onEvent: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("codex:event", handler);
    return () => ipcRenderer.removeListener("codex:event", handler);
  },
  onCompanionFocus: (listener) => {
    const handler = () => listener();
    ipcRenderer.on("companion:focus", handler);
    return () => ipcRenderer.removeListener("companion:focus", handler);
  },
});
