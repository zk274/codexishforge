import fs from "node:fs";
import path from "node:path";

function clone(value) {
  return structuredClone(value);
}

function versionOf(value) {
  return Number.isInteger(value?.version) && value.version >= 0 ? value.version : 0;
}

function parseFile(filePath, fsApi) {
  const value = JSON.parse(fsApi.readFileSync(filePath, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("State must be a JSON object");
  return value;
}

function syncDirectory(directory, fsApi) {
  let descriptor;
  try {
    descriptor = fsApi.openSync(directory, "r");
    fsApi.fsyncSync(descriptor);
  } catch {
    // Some filesystems do not permit syncing directories.
  } finally {
    if (descriptor !== undefined) try { fsApi.closeSync(descriptor); } catch {}
  }
}

export function atomicWriteJson(filePath, value, { fsApi = fs, rotateBackup = true } = {}) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) throw new TypeError("State path must be absolute");
  const directory = path.dirname(filePath);
  const backupPath = `${filePath}.backup`;
  const temporaryPath = `${filePath}.tmp`;
  fsApi.mkdirSync(directory, { recursive: true });
  if (rotateBackup && fsApi.existsSync(filePath)) {
    try {
      parseFile(filePath, fsApi);
      fsApi.copyFileSync(filePath, backupPath);
      fsApi.chmodSync?.(backupPath, 0o600);
    } catch {
      // Never replace a known-good backup with unreadable state.
    }
  }
  let descriptor;
  try {
    descriptor = fsApi.openSync(temporaryPath, "w", 0o600);
    fsApi.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsApi.fsyncSync?.(descriptor);
  } finally {
    if (descriptor !== undefined) fsApi.closeSync(descriptor);
  }
  fsApi.renameSync(temporaryPath, filePath);
  fsApi.chmodSync?.(filePath, 0o600);
  syncDirectory(directory, fsApi);
}

function migrate(value, currentVersion, migrations) {
  let migrated = clone(value);
  let version = versionOf(migrated);
  if (version > currentVersion) throw new RangeError(`State version ${version} is newer than supported version ${currentVersion}`);
  while (version < currentVersion) {
    const migration = migrations[version];
    if (typeof migration !== "function") throw new Error(`No state migration is available from version ${version}`);
    migrated = migration(clone(migrated));
    const nextVersion = versionOf(migrated);
    if (nextVersion !== version + 1) throw new Error(`State migration ${version} must produce version ${version + 1}`);
    version = nextVersion;
  }
  return migrated;
}

export function loadVersionedState(filePath, {
  currentVersion,
  migrations = {},
  defaults = {},
  normalize = (value) => value,
  fsApi = fs,
} = {}) {
  if (!Number.isInteger(currentVersion) || currentVersion < 1) throw new TypeError("Current state version must be positive");
  const backupPath = `${filePath}.backup`;
  let source = "primary";
  let raw;
  try {
    raw = parseFile(filePath, fsApi);
  } catch (primaryError) {
    if (!fsApi.existsSync(filePath)) {
      return {
        value: normalize({ ...clone(defaults), version: currentVersion }),
        meta: { status: "new", source: null, fromVersion: null, version: currentVersion, writable: true, error: null },
      };
    }
    try {
      raw = parseFile(backupPath, fsApi);
      source = "backup";
    } catch {
      return {
        value: normalize({ ...clone(defaults), version: currentVersion }),
        meta: { status: "unrecoverable", source: null, fromVersion: null, version: currentVersion, writable: false, error: String(primaryError.message || primaryError).slice(0, 500) },
      };
    }
  }

  const fromVersion = versionOf(raw);
  try {
    const value = normalize(migrate(raw, currentVersion, migrations));
    const migrated = fromVersion !== currentVersion;
    if (source === "backup" || migrated) atomicWriteJson(filePath, value, { fsApi, rotateBackup: source !== "backup" });
    return {
      value,
      meta: {
        status: source === "backup" ? "recovered" : migrated ? "migrated" : "current",
        source,
        fromVersion,
        version: currentVersion,
        writable: true,
        error: null,
      },
    };
  } catch (error) {
    return {
      value: normalize({ ...clone(defaults), version: currentVersion }),
      meta: {
        status: fromVersion > currentVersion ? "future" : "migration-failed",
        source,
        fromVersion,
        version: currentVersion,
        writable: false,
        error: String(error.message || error).slice(0, 500),
      },
    };
  }
}

export function saveVersionedState(filePath, value, { currentVersion, writable = true, fsApi = fs } = {}) {
  if (!writable) throw new Error("State is read-only until its recovery issue is resolved");
  atomicWriteJson(filePath, { ...clone(value), version: currentVersion }, { fsApi });
}
