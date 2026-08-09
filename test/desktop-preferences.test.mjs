import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DESKTOP_PREFERENCES,
  FALLBACK_SHORTCUT,
  GLOBAL_SHORTCUTS_PORTAL_FEATURE,
  TEXT_SCALE_OPTIONS,
  desktopPreferenceEffects,
  mergeChromiumFeatures,
  mergeDesktopPreferences,
  normalizeDesktopPreferences,
  shouldHideOnClose,
  shortcutCandidates,
} from "../src/main/desktop-preferences.mjs";
import { createTrayIconPng, withGnomeStatusNotifierPixmap } from "../src/main/tray-icon.mjs";

test("desktop preferences normalize defaults and reject unsupported shortcuts", () => {
  assert.deepEqual(normalizeDesktopPreferences(), DEFAULT_DESKTOP_PREFERENCES);
  assert.equal(normalizeDesktopPreferences({ quickPromptShortcut: "Ctrl+Q" }).quickPromptShortcut, DEFAULT_DESKTOP_PREFERENCES.quickPromptShortcut);
  assert.equal(normalizeDesktopPreferences({ quickPromptShortcut: null }).quickPromptShortcut, null);
});

test("disabling the tray also disables close-to-tray", () => {
  assert.deepEqual(normalizeDesktopPreferences({ trayEnabled: false, closeToTray: true }), {
    quickPromptShortcut: DEFAULT_DESKTOP_PREFERENCES.quickPromptShortcut,
    trayEnabled: false,
    closeToTray: false,
    notifyTurnComplete: true,
    notifyApproval: true,
    notifyTerminal: true,
    textScale: 1,
    reduceMotion: false,
    highContrast: false,
    screenReaderMode: false,
  });
  assert.equal(mergeDesktopPreferences({ trayEnabled: true, closeToTray: true }, { trayEnabled: false }).closeToTray, false);
});

test("accessibility preferences validate text scale and independent visual modes", () => {
  assert.deepEqual(TEXT_SCALE_OPTIONS, [1, 1.1, 1.25, 1.5]);
  assert.deepEqual(normalizeDesktopPreferences({
    textScale: 1.25,
    reduceMotion: true,
    highContrast: true,
    screenReaderMode: true,
  }), {
    ...DEFAULT_DESKTOP_PREFERENCES,
    textScale: 1.25,
    reduceMotion: true,
    highContrast: true,
    screenReaderMode: true,
  });
  assert.equal(normalizeDesktopPreferences({ textScale: 2 }).textScale, 1);
  assert.deepEqual(mergeDesktopPreferences(DEFAULT_DESKTOP_PREFERENCES, {
    textScale: 1.5,
    reduceMotion: true,
    unsupportedAccessibilityOption: true,
  }), {
    ...DEFAULT_DESKTOP_PREFERENCES,
    textScale: 1.5,
    reduceMotion: true,
  });
});

test("notification preferences default on and can be configured independently", () => {
  assert.deepEqual(normalizeDesktopPreferences({
    notifyTurnComplete: false,
    notifyApproval: true,
    notifyTerminal: false,
  }), {
    ...DEFAULT_DESKTOP_PREFERENCES,
    notifyTurnComplete: false,
    notifyApproval: true,
    notifyTerminal: false,
  });
  assert.equal(mergeDesktopPreferences(DEFAULT_DESKTOP_PREFERENCES, { notifyApproval: false }).notifyApproval, false);
});

test("Wayland portal feature merging preserves existing Chromium features without duplicates", () => {
  assert.equal(mergeChromiumFeatures("", GLOBAL_SHORTCUTS_PORTAL_FEATURE), GLOBAL_SHORTCUTS_PORTAL_FEATURE);
  assert.equal(
    mergeChromiumFeatures("UseOzonePlatform,WebRTCPipeWireCapturer", [GLOBAL_SHORTCUTS_PORTAL_FEATURE]),
    `UseOzonePlatform,WebRTCPipeWireCapturer,${GLOBAL_SHORTCUTS_PORTAL_FEATURE}`,
  );
  assert.equal(
    mergeChromiumFeatures(
      ` UseOzonePlatform, ${GLOBAL_SHORTCUTS_PORTAL_FEATURE},UseOzonePlatform `,
      [GLOBAL_SHORTCUTS_PORTAL_FEATURE],
    ),
    `UseOzonePlatform,${GLOBAL_SHORTCUTS_PORTAL_FEATURE}`,
  );
});

test("desktop preference transition effects avoid unnecessary shortcut portal churn", () => {
  const unrelatedUpdates = [
    { textScale: 1.25 },
    { reduceMotion: true },
    { highContrast: true },
    { screenReaderMode: true },
    { notifyTurnComplete: false },
    { notifyApproval: false },
    { notifyTerminal: false },
    { closeToTray: true },
  ];

  for (const updates of unrelatedUpdates) {
    const next = mergeDesktopPreferences(DEFAULT_DESKTOP_PREFERENCES, updates);
    assert.deepEqual(desktopPreferenceEffects(DEFAULT_DESKTOP_PREFERENCES, next), {
      reregisterShortcut: false,
      refreshTray: false,
    });
  }

  const shortcutChanged = mergeDesktopPreferences(DEFAULT_DESKTOP_PREFERENCES, {
    quickPromptShortcut: FALLBACK_SHORTCUT,
  });
  assert.deepEqual(desktopPreferenceEffects(DEFAULT_DESKTOP_PREFERENCES, shortcutChanged), {
    reregisterShortcut: true,
    refreshTray: true,
  });

  const trayChanged = mergeDesktopPreferences(DEFAULT_DESKTOP_PREFERENCES, { trayEnabled: false });
  assert.deepEqual(desktopPreferenceEffects(DEFAULT_DESKTOP_PREFERENCES, trayChanged), {
    reregisterShortcut: false,
    refreshTray: true,
  });
});

test("default shortcut has an automatic fallback while custom choices do not", () => {
  assert.deepEqual(shortcutCandidates(DEFAULT_DESKTOP_PREFERENCES), [DEFAULT_DESKTOP_PREFERENCES.quickPromptShortcut, FALLBACK_SHORTCUT]);
  assert.deepEqual(shortcutCandidates({ quickPromptShortcut: "CommandOrControl+Alt+Space" }), ["CommandOrControl+Alt+Space"]);
  assert.deepEqual(shortcutCandidates({ quickPromptShortcut: null }), []);
});

test("close-to-tray only hides when a tray is available and the app is not quitting", () => {
  const preferences = { trayEnabled: true, closeToTray: true };
  assert.equal(shouldHideOnClose(preferences, { trayAvailable: true }), true);
  assert.equal(shouldHideOnClose(preferences, { trayAvailable: false }), false);
  assert.equal(shouldHideOnClose(preferences, { trayAvailable: true, isQuitting: true }), false);
});

test("tray icon generator returns a valid PNG at the requested size", () => {
  const image = createTrayIconPng(20);
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(image.readUInt32BE(16), 20);
  assert.equal(image.readUInt32BE(20), 20);
});

test("GNOME tray creation selects pixmap transport without changing the session environment", () => {
  const env = { XDG_CURRENT_DESKTOP: "ubuntu:GNOME", XDG_SESSION_TYPE: "wayland" };
  const tray = { ready: true };
  assert.equal(withGnomeStatusNotifierPixmap(() => {
    assert.equal(env.XDG_CURRENT_DESKTOP, "XFCE");
    return tray;
  }, { platform: "linux", env, isGnome: true }), tray);
  assert.equal(env.XDG_CURRENT_DESKTOP, "ubuntu:GNOME");

  assert.throws(() => withGnomeStatusNotifierPixmap(() => {
    assert.equal(env.XDG_CURRENT_DESKTOP, "XFCE");
    throw new Error("tray failed");
  }, { platform: "linux", env, isGnome: true }), /tray failed/);
  assert.equal(env.XDG_CURRENT_DESKTOP, "ubuntu:GNOME");

  const envWithoutDesktop = {};
  withGnomeStatusNotifierPixmap(() => undefined, {
    platform: "linux",
    env: envWithoutDesktop,
    isGnome: true,
  });
  assert.equal(Object.hasOwn(envWithoutDesktop, "XDG_CURRENT_DESKTOP"), false);

  const passthroughEnvironment = { XDG_CURRENT_DESKTOP: "KDE" };
  withGnomeStatusNotifierPixmap(() => {
    assert.equal(passthroughEnvironment.XDG_CURRENT_DESKTOP, "KDE");
  }, { platform: "linux", env: passthroughEnvironment, isGnome: false });
  withGnomeStatusNotifierPixmap(() => {
    assert.equal(env.XDG_CURRENT_DESKTOP, "ubuntu:GNOME");
  }, { platform: "darwin", env, isGnome: true });
});
