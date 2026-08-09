export const DEFAULT_SHORTCUT = "CommandOrControl+Shift+Space";
export const FALLBACK_SHORTCUT = "Alt+Shift+Space";
export const GLOBAL_SHORTCUTS_PORTAL_FEATURE = "GlobalShortcutsPortal";
export const TEXT_SCALE_OPTIONS = Object.freeze([1, 1.1, 1.25, 1.5]);
export const SHORTCUT_OPTIONS = [
  DEFAULT_SHORTCUT,
  FALLBACK_SHORTCUT,
  "CommandOrControl+Alt+Space",
  "CommandOrControl+Shift+J",
  null,
];

export const DEFAULT_DESKTOP_PREFERENCES = Object.freeze({
  quickPromptShortcut: DEFAULT_SHORTCUT,
  trayEnabled: true,
  closeToTray: false,
  notifyTurnComplete: true,
  notifyApproval: true,
  notifyTerminal: true,
  textScale: 1,
  reduceMotion: false,
  highContrast: false,
  screenReaderMode: false,
});

export function normalizeDesktopPreferences(value = {}) {
  const candidate = value && typeof value === "object" ? value : {};
  const quickPromptShortcut = SHORTCUT_OPTIONS.includes(candidate.quickPromptShortcut)
    ? candidate.quickPromptShortcut
    : DEFAULT_DESKTOP_PREFERENCES.quickPromptShortcut;
  const trayEnabled = candidate.trayEnabled !== false;
  const textScale = TEXT_SCALE_OPTIONS.includes(candidate.textScale) ? candidate.textScale : DEFAULT_DESKTOP_PREFERENCES.textScale;
  return {
    quickPromptShortcut,
    trayEnabled,
    closeToTray: trayEnabled && candidate.closeToTray === true,
    notifyTurnComplete: candidate.notifyTurnComplete !== false,
    notifyApproval: candidate.notifyApproval !== false,
    notifyTerminal: candidate.notifyTerminal !== false,
    textScale,
    reduceMotion: candidate.reduceMotion === true,
    highContrast: candidate.highContrast === true,
    screenReaderMode: candidate.screenReaderMode === true,
  };
}

export function mergeDesktopPreferences(current, updates = {}) {
  const normalized = normalizeDesktopPreferences(current);
  const allowed = {};
  for (const key of Object.keys(DEFAULT_DESKTOP_PREFERENCES)) {
    if (Object.hasOwn(updates, key)) allowed[key] = updates[key];
  }
  return normalizeDesktopPreferences({ ...normalized, ...allowed });
}

export function mergeChromiumFeatures(current = "", requiredFeatures = []) {
  const required = Array.isArray(requiredFeatures) ? requiredFeatures : [requiredFeatures];
  const features = [current, ...required]
    .flatMap((value) => typeof value === "string" ? value.split(",") : [])
    .map((feature) => feature.trim())
    .filter(Boolean);
  return [...new Set(features)].join(",");
}

export function desktopPreferenceEffects(previous, next) {
  const before = normalizeDesktopPreferences(previous);
  const after = normalizeDesktopPreferences(next);
  const reregisterShortcut = before.quickPromptShortcut !== after.quickPromptShortcut;
  return {
    reregisterShortcut,
    refreshTray: reregisterShortcut || before.trayEnabled !== after.trayEnabled,
  };
}

export function shortcutCandidates(preferences) {
  const requested = normalizeDesktopPreferences(preferences).quickPromptShortcut;
  if (!requested) return [];
  return requested === DEFAULT_SHORTCUT ? [DEFAULT_SHORTCUT, FALLBACK_SHORTCUT] : [requested];
}

export function shouldHideOnClose(preferences, { trayAvailable = false, isQuitting = false } = {}) {
  return !isQuitting && trayAvailable && normalizeDesktopPreferences(preferences).closeToTray;
}
