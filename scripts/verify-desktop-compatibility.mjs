import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const architectures = {
  x64: { appImage: "x86_64", deb: "amd64" },
  arm64: { appImage: "arm64", deb: "arm64" },
};
const architecture = architectures[process.arch];
assert.ok(architecture, `Desktop compatibility testing does not support ${process.arch}`);
const electronVersion = JSON.parse(fs.readFileSync(path.join(projectRoot, "node_modules", "electron", "package.json"), "utf8")).version;

const appImagePath = path.join(
  projectRoot,
  "dist",
  `${packageJson.build.productName}-${packageJson.version}-${architecture.appImage}.AppImage`,
);
const debPath = path.join(
  projectRoot,
  "dist",
  `${packageJson.build.productName}-${packageJson.version}-${architecture.deb}.deb`,
);
assert.ok(fs.statSync(appImagePath).isFile(), `AppImage not found: ${appImagePath}`);
assert.ok(fs.statSync(debPath).isFile(), `Debian package not found: ${debPath}`);

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-linux-desktop-compatibility-"));
const appImageExtractionRoot = path.join(temporaryDirectory, "appimage");
fs.mkdirSync(appImageExtractionRoot, { recursive: true });
const appImageExtraction = spawnSync(appImagePath, ["--appimage-extract"], {
  cwd: appImageExtractionRoot,
  encoding: "utf8",
});
assert.equal(
  appImageExtraction.status,
  0,
  `Could not extract the AppImage\n${appImageExtraction.stdout || ""}${appImageExtraction.stderr || ""}`,
);
const appImageExecutable = path.join(appImageExtractionRoot, "squashfs-root", "AppRun");
assert.ok(fs.statSync(appImageExecutable).isFile(), `Extracted AppImage launcher not found: ${appImageExecutable}`);
const extractedDeb = path.join(temporaryDirectory, "deb");
const extraction = spawnSync("dpkg-deb", ["--extract", debPath, extractedDeb], {
  cwd: projectRoot,
  encoding: "utf8",
});
assert.equal(
  extraction.status,
  0,
  `Could not extract the Debian package\n${extraction.stdout || ""}${extraction.stderr || ""}`,
);
const debExecutable = path.join(extractedDeb, "opt", packageJson.build.productName, packageJson.name);
assert.ok(fs.statSync(debExecutable).isFile(), `Extracted Debian executable not found: ${debExecutable}`);

const xvfbRun = ["/usr/bin/xvfb-run", "/usr/local/bin/xvfb-run"].find((candidate) => fs.existsSync(candidate));
const xdotool = (process.env.PATH || "")
  .split(path.delimiter)
  .filter(Boolean)
  .map((directory) => path.join(directory, "xdotool"))
  .find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
const hasX11 = Boolean(process.env.DISPLAY || xvfbRun);
const hasWayland = Boolean(process.env.WAYLAND_DISPLAY && process.env.XDG_RUNTIME_DIR);
const requestedBackends = (process.env.DESKTOP_COMPATIBILITY_BACKENDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const backends = requestedBackends.length
  ? requestedBackends
  : [...(hasWayland ? ["wayland"] : []), ...(hasX11 ? ["x11"] : [])];
assert.ok(backends.length, "A Wayland display, X display, or xvfb-run is required");
for (const backend of backends) {
  assert.ok(["wayland", "x11"].includes(backend), `Unsupported desktop backend: ${backend}`);
  if (backend === "wayland") assert.ok(hasWayland, "The requested Wayland backend is unavailable");
  if (backend === "x11") assert.ok(hasX11, "The requested X11 backend is unavailable");
}

const packages = [
  { id: "appimage", expectedType: "appimage", executable: appImageExecutable },
  { id: "deb", expectedType: "deb", executable: debExecutable },
];

function isolatedEnvironment(label, backend, packageType) {
  const root = path.join(temporaryDirectory, label);
  const home = path.join(root, "home");
  const runtime = path.join(root, "runtime");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  return {
    ...(packageType === "appimage" ? { APPIMAGE: appImagePath } : {}),
    CI: "1",
    HOME: home,
    LANG: "C.UTF-8",
    PATH: "/usr/bin:/bin",
    XDG_CACHE_HOME: path.join(home, ".cache"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CURRENT_DESKTOP: process.env.XDG_CURRENT_DESKTOP || "",
    XDG_SESSION_TYPE: process.env.XDG_SESSION_TYPE || backend,
    XDG_RUNTIME_DIR: backend === "wayland" ? process.env.XDG_RUNTIME_DIR : runtime,
    ...(process.env.DBUS_SESSION_BUS_ADDRESS ? { DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS } : {}),
    ...(backend === "wayland" ? {
      WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY,
      ...(process.env.DISPLAY ? { DISPLAY: process.env.DISPLAY } : {}),
    } : {
      DISPLAY: process.env.DISPLAY || "",
      ...(process.env.XAUTHORITY ? { XAUTHORITY: process.env.XAUTHORITY } : {}),
    }),
  };
}

function launch(packageTarget, backend) {
  const label = `${packageTarget.id}-${backend}`;
  const reportPath = path.join(temporaryDirectory, `${label}.json`);
  const useXvfb = backend === "x11" && !process.env.DISPLAY && Boolean(xvfbRun);
  const shortcutActivationPath = useXvfb && xdotool
    ? path.join(temporaryDirectory, `${label}-shortcut-activation.json`)
    : null;
  const output = [];
  const applicationArguments = [
    `--ozone-platform=${backend}`,
    "--disable-gpu",
    "--no-sandbox",
    `--test-desktop-compatibility=${reportPath}`,
    ...(shortcutActivationPath ? [`--test-shortcut-activation=${shortcutActivationPath}`] : []),
    ...(!shortcutActivationPath ? ["--test-disable-global-shortcut"] : []),
  ];
  const command = useXvfb ? xvfbRun : packageTarget.executable;
  const args = useXvfb
    ? ["-a", packageTarget.executable, ...applicationArguments]
    : applicationArguments;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: isolatedEnvironment(label, backend, packageTarget.expectedType),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const collect = (chunk) => {
      output.push(chunk.toString());
      while (output.join("").length > 100_000) output.shift();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    let settled = false;
    let activationSent = false;
    let timer = null;
    const markerTimer = shortcutActivationPath ? setInterval(() => {
      if (settled || activationSent || !fs.existsSync(shortcutActivationPath)) return;
      let marker;
      try {
        marker = JSON.parse(fs.readFileSync(shortcutActivationPath, "utf8"));
      } catch {
        return;
      }
      const display = marker.DISPLAY || marker.display;
      const xauthority = marker.XAUTHORITY ?? marker.xauthority;
      if (typeof display !== "string" || !display.trim()) return;
      activationSent = true;
      const activation = spawnSync(xdotool, ["key", "--clearmodifiers", "ctrl+shift+space"], {
        cwd: projectRoot,
        encoding: "utf8",
        timeout: 5000,
        env: {
          ...process.env,
          DISPLAY: display,
          ...(typeof xauthority === "string" && xauthority ? { XAUTHORITY: xauthority } : {}),
        },
      });
      if (activation.stdout) collect(activation.stdout);
      if (activation.stderr) collect(activation.stderr);
      if (activation.error || activation.status !== 0) {
        settled = true;
        clearInterval(markerTimer);
        clearTimeout(timer);
        child.kill("SIGKILL");
        reject(new Error(`${label} could not activate the global shortcut with xdotool (${activation.error?.message || activation.signal || activation.status || "unknown"})\n${output.join("")}`));
      }
    }, 50) : null;
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      if (markerTimer) clearInterval(markerTimer);
      clearTimeout(timer);
      reject(error);
    });
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (markerTimer) clearInterval(markerTimer);
      child.kill("SIGKILL");
      reject(new Error(`${label} timed out\n${output.join("")}`));
    }, 45_000);
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      if (markerTimer) clearInterval(markerTimer);
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${label} failed (${signal || code || "unknown"})\n${output.join("")}`));
        return;
      }
      try {
        resolve({
          ...JSON.parse(fs.readFileSync(reportPath, "utf8")),
          id: label,
          display: useXvfb ? "xvfb" : backend === "x11" && process.env.XDG_SESSION_TYPE === "wayland" ? "xwayland" : backend,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function verify(report, packageTarget, backend) {
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.packaged, true);
  assert.equal(report.version, packageJson.version);
  assert.equal(report.packageType, packageTarget.expectedType);
  assert.equal(report.platform, "linux");
  assert.equal(report.arch, process.arch);
  assert.equal(report.runtime?.electron, electronVersion);
  assert.equal(report.environment?.requestedBackend, backend);
  assert.equal(report.window?.visible, true);
  assert.equal(report.window?.minimized, false);
  assert.equal(report.window?.destroyed, false);
  assert.ok(report.window?.bounds?.width >= 980);
  assert.ok(report.window?.bounds?.height >= 650);
  assert.equal(report.renderer?.readyState, "complete");
  assert.match(report.renderer?.title || "", /Codex Linux Community/);
  assert.equal(report.renderer?.hasComposer, true);
  assert.equal(report.renderer?.hasPrimaryNavigation, true);
  assert.ok(report.renderer?.dialogs > 0);
  assert.equal(report.renderer?.namedDialogs, report.renderer?.dialogs);
  assert.equal(report.renderer?.backgroundInert, report.renderer?.openDialogs > 0);
  assert.ok(report.renderer?.viewport?.width > 0);
  assert.ok(report.renderer?.viewport?.height > 0);
  assert.equal(report.renderer?.studioHighZoom?.open, true);
  const viewportHeight = report.renderer.viewport.height;
  const studio = report.renderer.studioHighZoom;
  assert.ok(studio.canvas.dialog.top >= -1, "Studio dialog extends above the high-zoom viewport");
  assert.ok(studio.canvas.dialog.bottom <= viewportHeight + 1, "Studio dialog extends below the high-zoom viewport");
  assert.ok(studio.canvas.action.top >= studio.canvas.view.top - 1, "Studio Canvas action extends above its view");
  assert.ok(studio.canvas.action.bottom <= Math.min(studio.canvas.view.bottom, viewportHeight) + 1, "Studio Canvas action is clipped at high zoom");
  assert.equal(studio.canvas.overlayOverflowY, "auto");
  assert.ok(studio.templateEditor.scrollHeight > studio.templateEditor.clientHeight, "Studio template editor does not exercise overflow at high zoom");
  assert.ok(studio.templateEditor.scrollTop > 0, "Studio template editor did not scroll at high zoom");
  assert.ok(studio.templateEditor.action.top >= studio.templateEditor.bounds.top - 1, "Studio template action extends above its editor");
  assert.ok(studio.templateEditor.action.bottom <= Math.min(studio.templateEditor.bounds.bottom, viewportHeight) + 1, "Studio template action is unreachable at high zoom");
  assert.equal(typeof report.desktop?.shortcut?.registered, "boolean");
  assert.equal(report.desktop.shortcut.portalFeatureEnabled, true);
  assert.equal(report.desktop.quickPrompt.mainHidden, true);
  assert.equal(report.desktop.quickPrompt.companionVisible, true);
  assert.equal(report.desktop.quickPrompt.companionDestroyed, false);
  assert.equal(report.desktop.quickPrompt.renderer.readyState, "complete");
  assert.equal(report.desktop.quickPrompt.renderer.hasInput, true);
  assert.equal(report.desktop.quickPrompt.renderer.activeElement, "quickInput");
  if (!report.desktop.quickPrompt.activationTested) {
    assert.equal(report.desktop.shortcut.testDisabled, true);
    assert.equal(report.desktop.shortcut.registered, false);
    assert.equal(report.desktop.shortcut.confirmed, false);
    assert.match(report.desktop.shortcut.error || "", /disabled in packaged automation/);
    assert.equal(report.desktop.quickPrompt.activation.lastSource, "compatibility-probe");
  } else {
    assert.equal(report.desktop.shortcut.testDisabled, false);
    assert.equal(report.desktop.shortcut.registered, true);
    assert.equal(report.desktop.shortcut.confirmed, true);
    assert.equal(report.desktop.shortcut.accelerator, report.desktop.shortcut.requested);
    assert.equal(report.desktop.quickPrompt.activationTested, true);
    assert.equal(report.desktop.quickPrompt.activation.lastSource, "global-shortcut");
  }
  assert.equal(report.desktop?.tray?.enabled, true);
  assert.ok(report.desktop.tray.available || report.desktop.tray.error);
  assert.equal(typeof report.desktop?.notifications?.supported, "boolean");
  assert.equal(report.capture?.empty, false);
  assert.ok(report.capture?.width > 0);
  assert.ok(report.capture?.height > 0);
  assert.ok(report.capture?.pngBytes > 1000);
}

try {
  const cases = [];
  for (const backend of backends) {
    for (const packageTarget of packages) {
      const report = await launch(packageTarget, backend);
      verify(report, packageTarget, backend);
      cases.push(report);
    }
  }
  const shortcutActivationTested = cases.some((report) => report.desktop?.quickPrompt?.activationTested === true);
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    appVersion: packageJson.version,
    host: {
      platform: process.platform,
      arch: process.arch,
      desktop: process.env.XDG_CURRENT_DESKTOP || null,
      sessionType: process.env.XDG_SESSION_TYPE || null,
    },
    coverage: {
      packages: packages.map(({ id }) => id),
      backends,
      quickPromptShortcut: shortcutActivationTested
        ? "real X11 accelerator activation plus companion-window behavior; native Wayland delivery remains manual"
        : "companion-window behavior only; native desktop accelerator delivery remains manual",
      snap: "metadata and payload integrity are covered by artifact verification; installed Snap behavior remains manual",
    },
    cases,
  };
  const resultPath = path.join(projectRoot, "dist", "desktop-compatibility-report.json");
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
