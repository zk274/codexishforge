import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${signal || code || "unknown"})`));
    });
  });
}

export function classicSnapLauncher(
  executableName,
  { desktopName = "community.codexlinux.desktop" } = {},
) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(executableName)) throw new TypeError("Snap executable name is invalid");
  if (!/^[a-z0-9][a-z0-9.-]*\.desktop$/.test(desktopName)) throw new TypeError("Linux desktop name is invalid");
  return [
    "#!/bin/sh",
    `export CHROME_DESKTOP="\${SNAP_INSTANCE_NAME:-${executableName}}_${desktopName}"`,
    `exec "$SNAP/${executableName}" --no-sandbox "$@"`,
    "",
  ].join("\n");
}

export async function waitForStableArtifact(filePath, {
  intervalMs = 1_000,
  stableSamples = 5,
  timeoutMs = 90_000,
} = {}) {
  const startedAt = Date.now();
  let lastSize = -1;
  let stable = 0;
  while (Date.now() - startedAt < timeoutMs) {
    const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : -1;
    if (size > 0 && size === lastSize) stable += 1;
    else stable = 0;
    if (stable >= stableSamples) return size;
    lastSize = size;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Snap artifact did not stabilize: ${filePath}`);
}

export async function patchClassicSnapLauncher(snapPath, executableName) {
  if (!path.isAbsolute(snapPath)) throw new TypeError("Snap path must be absolute");
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-linux-snap-launcher-"));
  const extractedDirectory = path.join(temporaryDirectory, "root");
  const patchedPath = `${snapPath}.patched`;
  try {
    fs.rmSync(patchedPath, { force: true });
    await run("unsquashfs", ["-no-progress", "-d", extractedDirectory, snapPath]);
    fs.writeFileSync(
      path.join(extractedDirectory, "command.sh"),
      classicSnapLauncher(executableName),
      { mode: 0o755 },
    );
    for (const entry of fs.readdirSync(extractedDirectory)) {
      if (/^snap-template-.+\.tar$/.test(entry)) {
        fs.rmSync(path.join(extractedDirectory, entry), { force: true });
      }
    }
    await run("mksquashfs", [
      extractedDirectory,
      patchedPath,
      "-noappend",
      "-comp",
      "xz",
      "-no-xattrs",
      "-no-fragments",
      "-all-root",
      "-quiet",
    ]);
    fs.renameSync(patchedPath, snapPath);
  } finally {
    fs.rmSync(patchedPath, { force: true });
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
