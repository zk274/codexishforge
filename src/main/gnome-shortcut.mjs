import {
  APP_NAME,
  APP_SLUG,
  APP_URL_SCHEME,
  LEGACY_APP_NAME,
  LEGACY_APP_SLUG,
  LEGACY_APP_URL_SCHEME,
} from "../shared/app-identity.mjs";

export const GNOME_MEDIA_KEYS_SCHEMA = "org.gnome.settings-daemon.plugins.media-keys";
export const GNOME_CUSTOM_KEYBINDING_SCHEMA = "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding";
export const GNOME_CUSTOM_KEYBINDINGS_KEY = "custom-keybindings";
export const CODEXISHFORGE_GNOME_SHORTCUT_PATH = `/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/${APP_SLUG}/`;
export const CODEXISHFORGE_GNOME_SHORTCUT_NAME = `${APP_NAME} Quick Prompt`;
export const CODEXISHFORGE_QUICK_PROMPT_LINK = `${APP_URL_SCHEME}://quick-prompt`;
export const CODEXISHFORGE_GNOME_SHORTCUT_COMMAND = `xdg-open '${CODEXISHFORGE_QUICK_PROMPT_LINK}'`;
export const LEGACY_GNOME_SHORTCUT_PATH = `/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/${LEGACY_APP_SLUG}/`;
export const LEGACY_GNOME_SHORTCUT_NAME = `${LEGACY_APP_NAME.replace(" Community", "")} Quick Prompt`;
export const LEGACY_QUICK_PROMPT_LINK = `${LEGACY_APP_URL_SCHEME}://quick-prompt`;
export const LEGACY_GNOME_SHORTCUT_COMMAND = `xdg-open '${LEGACY_QUICK_PROMPT_LINK}'`;

export const GNOME_SHORTCUT_BINDINGS = Object.freeze({
  "CommandOrControl+Shift+Space": "<Primary><Shift>space",
  "Alt+Shift+Space": "<Alt><Shift>space",
  "CommandOrControl+Alt+Space": "<Primary><Alt>space",
  "CommandOrControl+Shift+J": "<Primary><Shift>j",
});

const OWNED_SCHEMA = `${GNOME_CUSTOM_KEYBINDING_SCHEMA}:${CODEXISHFORGE_GNOME_SHORTCUT_PATH}`;
const LEGACY_SCHEMA = `${GNOME_CUSTOM_KEYBINDING_SCHEMA}:${LEGACY_GNOME_SHORTCUT_PATH}`;
const OWNED_KEYS = Object.freeze(["name", "command", "binding"]);

function normalizedEnvironmentValue(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function detectGnomeWaylandSession(env = process.env) {
  const sessionType = normalizedEnvironmentValue(env?.XDG_SESSION_TYPE);
  const isWayland = sessionType
    ? sessionType === "wayland"
    : Boolean(typeof env?.WAYLAND_DISPLAY === "string" && env.WAYLAND_DISPLAY.trim());

  const desktopValues = [env?.XDG_CURRENT_DESKTOP, env?.XDG_SESSION_DESKTOP, env?.DESKTOP_SESSION]
    .filter((value) => typeof value === "string")
    .flatMap((value) => value.toLowerCase().split(/[:;,]/u))
    .map((value) => value.trim())
    .filter(Boolean);
  const hasGnomeEnvironmentMarker = [
    env?.GNOME_DESKTOP_SESSION_ID,
    env?.GNOME_SHELL_SESSION_MODE,
    env?.GNOME_SESSION_MODE,
  ].some((value) => typeof value === "string" && value.trim());
  const isGnome = desktopValues.some((value) => value === "gnome" || value.startsWith("gnome-"))
    || hasGnomeEnvironmentMarker;

  return Object.freeze({
    isGnome,
    isWayland,
    supported: isGnome && isWayland,
  });
}

export function isGnomeWaylandSession(env = process.env) {
  return detectGnomeWaylandSession(env).supported;
}

export function toGnomeShortcutBinding(accelerator) {
  return typeof accelerator === "string" ? GNOME_SHORTCUT_BINDINGS[accelerator] ?? null : null;
}

export function quoteGnomeCommandArgument(value) {
  if (typeof value !== "string" || !value || value.includes("\0") || /[\r\n]/u.test(value)) {
    throw new TypeError("GNOME shortcut command arguments must be non-empty, single-line strings");
  }
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function quickPromptCommand(executable) {
  return `${quoteGnomeCommandArgument(executable)} ${quoteGnomeCommandArgument(CODEXISHFORGE_QUICK_PROMPT_LINK)}`;
}

export function serializeGSettingsString(value) {
  if (typeof value !== "string") throw new TypeError("GSettings string values must be strings");
  if (value.includes("\0")) throw new TypeError("GSettings string values cannot contain NUL bytes");
  return `'${value
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t")}'`;
}

export function serializeGSettingsStringArray(values) {
  if (!Array.isArray(values)) throw new TypeError("GSettings string arrays must be arrays");
  return `[${values.map((value) => serializeGSettingsString(value)).join(", ")}]`;
}

function decodeEscapedCharacter(character) {
  switch (character) {
    case "n": return "\n";
    case "r": return "\r";
    case "t": return "\t";
    case "\\": return "\\";
    case "'": return "'";
    case '"': return '"';
    default: throw new TypeError(`Unsupported escape in GSettings string array: \\${character}`);
  }
}

export function parseGSettingsStringArray(output) {
  let source;
  if (Buffer.isBuffer(output)) source = output.toString("utf8");
  else if (typeof output === "string") source = output;
  else throw new TypeError("GSettings output must be a string or Buffer");

  source = source.trim().replace(/^@as\s+/u, "").trim();
  if (!source.startsWith("[") || !source.endsWith("]")) {
    throw new TypeError("Invalid GSettings string-array output");
  }

  let index = 1;
  const end = source.length - 1;
  const values = [];
  const skipWhitespace = () => {
    while (index < end && /\s/u.test(source[index])) index += 1;
  };

  skipWhitespace();
  if (index === end) return values;

  while (index < end) {
    const quote = source[index];
    if (quote !== "'" && quote !== '"') throw new TypeError("Invalid GSettings string-array item");
    index += 1;
    let value = "";
    let closed = false;

    while (index < end) {
      const character = source[index];
      index += 1;
      if (character === quote) {
        closed = true;
        break;
      }
      if (character === "\\") {
        if (index >= end) throw new TypeError("Unterminated escape in GSettings string array");
        value += decodeEscapedCharacter(source[index]);
        index += 1;
      } else {
        value += character;
      }
    }

    if (!closed) throw new TypeError("Unterminated GSettings string-array item");
    values.push(value);
    skipWhitespace();
    if (index === end) break;
    if (source[index] !== ",") throw new TypeError("Invalid GSettings string-array separator");
    index += 1;
    skipWhitespace();
    if (index === end) throw new TypeError("Trailing commas are not accepted in GSettings string arrays");
  }

  return values;
}

export function parseGSettingsString(output) {
  let source;
  if (Buffer.isBuffer(output)) source = output.toString("utf8");
  else if (typeof output === "string") source = output;
  else throw new TypeError("GSettings output must be a string or Buffer");
  source = source.trim().replace(/^@s\s+/u, "").trim();
  const values = parseGSettingsStringArray(`[${source}]`);
  if (values.length !== 1) throw new TypeError("Invalid GSettings string output");
  return values[0];
}

export function isLegacyAppOwnedShortcut({ name, command } = {}) {
  if (name !== LEGACY_GNOME_SHORTCUT_NAME || typeof command !== "string") return false;
  return command === LEGACY_GNOME_SHORTCUT_COMMAND
    || (
      command.startsWith("'")
      && command.endsWith(` '${LEGACY_QUICK_PROMPT_LINK}'`)
      && !/[\0\r\n]/u.test(command)
    );
}

function commandOutput(result) {
  if (Buffer.isBuffer(result) || typeof result === "string") return result;
  if (result && (Buffer.isBuffer(result.stdout) || typeof result.stdout === "string")) return result.stdout;
  return "";
}

function executeFile(execFile, file, args) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(commandOutput(result));
    };
    const callback = (error, stdout) => finish(error, stdout);

    let result;
    try {
      result = execFile(file, args, { encoding: "utf8", windowsHide: true, shell: false }, callback);
    } catch (error) {
      finish(error);
      return;
    }

    if (result && typeof result.then === "function") {
      result.then((value) => finish(null, value), (error) => finish(error));
    } else if (
      Buffer.isBuffer(result)
      || typeof result === "string"
      || (result && (Buffer.isBuffer(result.stdout) || typeof result.stdout === "string"))
    ) {
      finish(null, result);
    }
    // Node's callback-style execFile returns a ChildProcess. In that case the
    // callback above is the sole source of completion.
  });
}

export class GnomeShortcutController {
  constructor({ execFile, env = process.env, binary = "gsettings", command = CODEXISHFORGE_GNOME_SHORTCUT_COMMAND } = {}) {
    if (typeof execFile !== "function") throw new TypeError("GnomeShortcutController requires an execFile function");
    if (typeof command !== "string" || !command || command.includes("\0") || /[\r\n]/u.test(command)) {
      throw new TypeError("GNOME shortcut command must be a non-empty, single-line string");
    }
    this.execFile = execFile;
    this.env = env;
    this.binary = binary;
    this.command = command;
  }

  get session() {
    return detectGnomeWaylandSession(this.env);
  }

  get supported() {
    return this.session.supported;
  }

  async #run(args) {
    return executeFile(this.execFile, this.binary, args);
  }

  async #readPaths() {
    const output = await this.#run(["get", GNOME_MEDIA_KEYS_SCHEMA, GNOME_CUSTOM_KEYBINDINGS_KEY]);
    return parseGSettingsStringArray(output);
  }

  async #setOwnedKey(key, value) {
    await this.#run(["set", OWNED_SCHEMA, key, serializeGSettingsString(value)]);
  }

  async #readLegacyOwnership() {
    const [name, command] = await Promise.all([
      this.#run(["get", LEGACY_SCHEMA, "name"]).then(parseGSettingsString),
      this.#run(["get", LEGACY_SCHEMA, "command"]).then(parseGSettingsString),
    ]);
    return { owned: isLegacyAppOwnedShortcut({ name, command }), name, command };
  }

  async #resetSchema(schema) {
    for (const key of OWNED_KEYS) await this.#run(["reset", schema, key]);
  }

  async install(accelerator) {
    if (!this.supported) {
      return { installed: false, reason: "unsupported-session", session: this.session };
    }
    const binding = toGnomeShortcutBinding(accelerator);
    if (!binding) return { installed: false, reason: "unsupported-accelerator" };

    const paths = await this.#readPaths();
    const hasLegacy = paths.includes(LEGACY_GNOME_SHORTCUT_PATH);
    if (hasLegacy) {
      const legacy = await this.#readLegacyOwnership();
      if (!legacy.owned) {
        return { installed: false, reason: "legacy-conflict", path: LEGACY_GNOME_SHORTCUT_PATH };
      }
    }

    await this.#setOwnedKey("name", CODEXISHFORGE_GNOME_SHORTCUT_NAME);
    await this.#setOwnedKey("command", this.command);
    await this.#setOwnedKey("binding", binding);

    const added = !paths.includes(CODEXISHFORGE_GNOME_SHORTCUT_PATH);
    const migrated = hasLegacy;
    if (added || migrated) {
      const nextPaths = [];
      for (const candidate of paths) {
        if (candidate === LEGACY_GNOME_SHORTCUT_PATH) continue;
        if (candidate === CODEXISHFORGE_GNOME_SHORTCUT_PATH && nextPaths.includes(candidate)) continue;
        nextPaths.push(candidate);
      }
      if (!nextPaths.includes(CODEXISHFORGE_GNOME_SHORTCUT_PATH)) nextPaths.push(CODEXISHFORGE_GNOME_SHORTCUT_PATH);
      await this.#run([
        "set",
        GNOME_MEDIA_KEYS_SCHEMA,
        GNOME_CUSTOM_KEYBINDINGS_KEY,
        serializeGSettingsStringArray(nextPaths),
      ]);
    }

    if (migrated) await this.#resetSchema(LEGACY_SCHEMA);

    return { installed: true, added, migrated, binding, path: CODEXISHFORGE_GNOME_SHORTCUT_PATH };
  }

  async remove() {
    const session = this.session;
    if (!session.isGnome) return { removed: false, reason: "unsupported-desktop", session };

    const paths = await this.#readPaths();
    let legacyOwned = false;
    if (paths.includes(LEGACY_GNOME_SHORTCUT_PATH)) {
      legacyOwned = (await this.#readLegacyOwnership()).owned;
    }
    const remaining = paths.filter((candidate) => (
      candidate !== CODEXISHFORGE_GNOME_SHORTCUT_PATH
      && !(legacyOwned && candidate === LEGACY_GNOME_SHORTCUT_PATH)
    ));
    const removed = remaining.length !== paths.length;
    if (removed) {
      await this.#run([
        "set",
        GNOME_MEDIA_KEYS_SCHEMA,
        GNOME_CUSTOM_KEYBINDINGS_KEY,
        serializeGSettingsStringArray(remaining),
      ]);
    }
    await this.#resetSchema(OWNED_SCHEMA);
    if (legacyOwned) await this.#resetSchema(LEGACY_SCHEMA);
    return {
      removed,
      legacyRemoved: legacyOwned && paths.includes(LEGACY_GNOME_SHORTCUT_PATH),
      legacyConflict: paths.includes(LEGACY_GNOME_SHORTCUT_PATH) && !legacyOwned,
      path: CODEXISHFORGE_GNOME_SHORTCUT_PATH,
    };
  }
}
