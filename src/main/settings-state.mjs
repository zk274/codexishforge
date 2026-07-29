import { normalizeReportingPreferences } from "./release-reporting.mjs";
import { loadVersionedState, saveVersionedState } from "./state-storage.mjs";

export const SETTINGS_STATE_VERSION = 2;
export const SETTINGS_MIGRATIONS = Object.freeze({
  0: (value) => ({ ...value, version: 1 }),
  1: (value) => ({ ...value, version: 2, reporting: normalizeReportingPreferences(value.reporting) }),
});

export function loadSettingsState(filePath, options = {}) {
  return loadVersionedState(filePath, {
    ...options,
    currentVersion: SETTINGS_STATE_VERSION,
    migrations: SETTINGS_MIGRATIONS,
    defaults: { reporting: normalizeReportingPreferences() },
  });
}

export function saveSettingsState(filePath, value, { writable = true, fsApi } = {}) {
  saveVersionedState(filePath, value, {
    currentVersion: SETTINGS_STATE_VERSION,
    writable,
    ...(fsApi ? { fsApi } : {}),
  });
  return {
    status: "current",
    source: "primary",
    fromVersion: SETTINGS_STATE_VERSION,
    version: SETTINGS_STATE_VERSION,
    writable: true,
    error: null,
  };
}
