import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DESKTOP_PREFERENCES,
  FALLBACK_SHORTCUT,
  mergeDesktopPreferences,
  normalizeDesktopPreferences,
  shouldHideOnClose,
  shortcutCandidates,
} from "../src/main/desktop-preferences.mjs";
import { createTrayIconPng } from "../src/main/tray-icon.mjs";

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
  });
  assert.equal(mergeDesktopPreferences({ trayEnabled: true, closeToTray: true }, { trayEnabled: false }).closeToTray, false);
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
