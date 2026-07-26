import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function isExecutable(candidate, fsApi = fs) {
  try {
    fsApi.accessSync(candidate, fs.constants.X_OK);
    return fsApi.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function extensionRoots(home) {
  return [
    path.join(home, ".vscode", "extensions"),
    path.join(home, ".vscode-insiders", "extensions"),
    path.join(home, ".vscode-oss", "extensions"),
    path.join(home, ".cursor", "extensions"),
    path.join(home, ".windsurf", "extensions"),
    path.join(home, ".var", "app", "com.visualstudio.code", "data", "vscode", "extensions"),
    path.join(home, ".var", "app", "com.vscodium.codium", "data", "vscode", "extensions"),
  ];
}

function extensionCandidates(home, platform = process.platform, arch = process.arch, fsApi = fs) {
  if (platform !== "linux") return [];
  const platformDirectory = arch === "arm64" ? "linux-arm64" : "linux-x86_64";
  const candidates = [];
  for (const root of extensionRoots(home)) {
    let entries = [];
    try {
      entries = fsApi.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    const matching = entries
      .filter((entry) => entry.isDirectory() && /^(openai\.chatgpt|openai\.codex)-/i.test(entry.name))
      .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true }));
    for (const entry of matching) candidates.push(path.join(root, entry.name, "bin", platformDirectory, "codex"));
  }
  return candidates;
}

export function codexCandidates({ env = process.env, home = os.homedir(), platform = process.platform, arch = process.arch, fsApi = fs, configuredPath = null } = {}) {
  const fromPath = String(env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.join(directory, platform === "win32" ? "codex.exe" : "codex"));
  return [
    configuredPath,
    env.CODEX_CLI_PATH,
    ...fromPath,
    path.join(home, ".local", "bin", "codex"),
    path.join(home, ".npm-global", "bin", "codex"),
    path.join(home, ".cargo", "bin", "codex"),
    ...extensionCandidates(home, platform, arch, fsApi),
  ].filter(Boolean);
}

export function resolveCodexCommand(options = {}) {
  const fsApi = options.fsApi || fs;
  const candidates = [...new Set(codexCandidates(options))];
  return {
    command: candidates.find((candidate) => isExecutable(candidate, fsApi)) || null,
    searched: candidates,
  };
}

export function validateCodexCommand(candidate, fsApi = fs) {
  if (!candidate || !path.isAbsolute(candidate)) throw new Error("Select an absolute path to the Codex executable");
  if (!isExecutable(candidate, fsApi)) throw new Error("The selected file is not executable");
  return candidate;
}
