import fs from "node:fs";
import path from "node:path";
import { APP_NAME, APP_SLUG, LEGACY_APP_SLUG } from "../shared/app-identity.mjs";

export const USER_DATA_MIGRATION_MARKER = ".codexishforge-migration.json";
export const USER_DATA_MIGRATION_SCHEMA = 1;

function migrationError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function inspectDirectory(fsModule, candidate, label) {
  let stat;
  try {
    stat = fsModule.lstatSync(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false };
    throw migrationError(`${APP_NAME} could not inspect its ${label} data directory: ${error.message}`, "USER_DATA_INSPECTION_FAILED");
  }
  if (stat.isSymbolicLink()) {
    throw migrationError(`${APP_NAME} will not use a symbolic link as its ${label} data directory.`, "USER_DATA_UNSAFE_PATH");
  }
  if (!stat.isDirectory()) {
    throw migrationError(`${APP_NAME}'s ${label} data path exists but is not a directory.`, "USER_DATA_UNSAFE_PATH");
  }
  return { exists: true };
}

function migrationMarkerContents(legacySlug) {
  return `${JSON.stringify({ schema: USER_DATA_MIGRATION_SCHEMA, source: legacySlug })}\n`;
}

function hasRecognizedMigrationMarker(fsModule, currentPath, legacySlug) {
  const markerPath = path.join(currentPath, USER_DATA_MIGRATION_MARKER);
  let stat;
  try {
    stat = fsModule.lstatSync(markerPath);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw migrationError(`${APP_NAME} could not inspect its migration marker: ${error.message}`, "USER_DATA_INSPECTION_FAILED");
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return false;
  try {
    const marker = JSON.parse(fsModule.readFileSync(markerPath, "utf8"));
    return marker?.schema === USER_DATA_MIGRATION_SCHEMA
      && marker?.source === legacySlug
      && Object.keys(marker).length === 2;
  } catch {
    return false;
  }
}

function processIsRunning(pid, processKill) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  try {
    processKill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    return null;
  }
}

function boundedPid(value) {
  if (typeof value !== "string" || !/^\s*[1-9][0-9]{0,9}\s*$/u.test(value)) return null;
  const pid = Number.parseInt(value, 10);
  return Number.isSafeInteger(pid) ? pid : null;
}

function legacyDirectoryInUse(fsModule, legacyPath, processKill) {
  const runningMarker = path.join(legacyPath, "running.lock");
  try {
    const running = processIsRunning(boundedPid(fsModule.readFileSync(runningMarker, "utf8")), processKill);
    if (running !== false) return true;
  } catch (error) {
    if (error?.code !== "ENOENT") return true;
  }

  const singletonLock = path.join(legacyPath, "SingletonLock");
  try {
    const stat = fsModule.lstatSync(singletonLock);
    let value = "";
    if (stat.isSymbolicLink()) value = fsModule.readlinkSync(singletonLock);
    else if (stat.isFile()) value = fsModule.readFileSync(singletonLock, "utf8");
    else return true;
    const match = String(value).trim().match(/(?:^|-)([1-9][0-9]{0,9})$/u);
    const running = processIsRunning(match ? Number.parseInt(match[1], 10) : null, processKill);
    if (running !== false) return true;
  } catch (error) {
    if (error?.code !== "ENOENT") return true;
  }
  return false;
}

export function isEphemeralUserDataPath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath) return false;
  const parts = relativePath.split(path.sep);
  const basename = parts.at(-1);
  return (parts.length === 1 && basename === "running.lock")
    || (parts.length === 1 && basename.startsWith("Singleton"));
}

export function migrateLegacyUserData({
  appDataDirectory,
  fsModule = fs,
  currentSlug = APP_SLUG,
  legacySlug = LEGACY_APP_SLUG,
  processKill = process.kill.bind(process),
} = {}) {
  if (typeof appDataDirectory !== "string" || !path.isAbsolute(appDataDirectory)) {
    throw new TypeError("The Electron app-data directory must be absolute");
  }
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(currentSlug) || !/^[a-z0-9][a-z0-9-]*$/u.test(legacySlug)) {
    throw new TypeError("Application data directory names must be safe slugs");
  }
  if (currentSlug === legacySlug) throw new TypeError("Current and legacy application data directories must differ");

  const root = path.resolve(appDataDirectory);
  const currentPath = path.join(root, currentSlug);
  const legacyPath = path.join(root, legacySlug);
  const current = inspectDirectory(fsModule, currentPath, "current");
  const legacy = inspectDirectory(fsModule, legacyPath, "legacy");

  if (legacy.exists && legacyDirectoryInUse(fsModule, legacyPath, processKill)) {
    throw migrationError(
      `${APP_NAME} cannot migrate or reuse its legacy data while ${legacySlug} may still be running. Fully quit the old app, then reopen ${APP_NAME}.`,
      "USER_DATA_IN_USE",
    );
  }

  if (current.exists && legacy.exists) {
    if (!hasRecognizedMigrationMarker(fsModule, currentPath, legacySlug)) {
      throw migrationError(
        `${APP_NAME} found both ${currentPath} and ${legacyPath}, but the current directory has no recognized ${APP_NAME} migration marker. It will not merge or choose between them automatically. Move one aside after confirming which copy contains your data, then reopen ${APP_NAME}.`,
        "USER_DATA_CONFLICT",
      );
    }
    return Object.freeze({
      userDataPath: currentPath,
      legacyPath,
      migrated: true,
      existing: true,
      rollbackAvailable: true,
      reusedMigration: true,
    });
  }

  if (!legacy.exists) {
    return Object.freeze({
      userDataPath: currentPath,
      legacyPath,
      migrated: false,
      existing: current.exists,
      rollbackAvailable: false,
      reusedMigration: false,
    });
  }

  let temporaryRoot = null;
  try {
    temporaryRoot = fsModule.mkdtempSync(path.join(root, `.${currentSlug}.migration-`));
    const temporaryPath = path.join(temporaryRoot, currentSlug);
    fsModule.cpSync(legacyPath, temporaryPath, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
      preserveTimestamps: true,
      filter(source) {
        const relative = path.relative(legacyPath, source);
        return !relative || !isEphemeralUserDataPath(relative);
      },
    });
    fsModule.writeFileSync(
      path.join(temporaryPath, USER_DATA_MIGRATION_MARKER),
      migrationMarkerContents(legacySlug),
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    if (legacyDirectoryInUse(fsModule, legacyPath, processKill)) {
      throw migrationError(
        `${APP_NAME} detected that ${legacySlug} started while its data was being copied. The incomplete ${APP_NAME} copy was discarded; fully quit the old app and try again.`,
        "USER_DATA_IN_USE",
      );
    }
    fsModule.renameSync(temporaryPath, currentPath);
    fsModule.rmSync(temporaryRoot, { recursive: true, force: true });
  } catch (error) {
    if (temporaryRoot) try { fsModule.rmSync(temporaryRoot, { recursive: true, force: true }); } catch {}
    if (error?.code === "USER_DATA_IN_USE") throw error;
    throw migrationError(
      `${APP_NAME} could not create its migrated data directory at ${currentPath}: ${error.message}. The legacy directory was left unchanged.`,
      "USER_DATA_MIGRATION_FAILED",
    );
  }

  return Object.freeze({
    userDataPath: currentPath,
    legacyPath,
    migrated: true,
    existing: true,
    rollbackAvailable: true,
    reusedMigration: false,
  });
}
