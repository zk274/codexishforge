import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/renderer/app.js", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main/main.mjs", import.meta.url), "utf8");
const desktopCompatibility = fs.readFileSync(new URL("../scripts/verify-desktop-compatibility.mjs", import.meta.url), "utf8");

test("primary navigation and changing status have accessible semantics", () => {
  assert.match(html, /class="skip-link" href="#conversation"/);
  assert.match(html, /id="conversation"[^>]*tabindex="-1"[^>]*aria-label=/);
  assert.match(html, /id="toast"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /id="regionStatus" aria-live="polite"/);
  assert.match(html, /id="assistiveAnnouncements"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
});

test("every modal dialog is named and modal focus is contained", () => {
  const dialogs = [...html.matchAll(/<(?:section|div)[^>]*role="dialog"[^>]*>/g)].map(([tag]) => tag);
  assert.equal(dialogs.length, 10);
  for (const dialog of dialogs) {
    assert.match(dialog, /aria-modal="true"/);
    assert.match(dialog, /aria-labelledby="[^"]+"/);
  }
  assert.match(app, /function trapModalFocus/);
  assert.match(app, /document\.querySelector\("\.app-shell"\)\.inert = modalOpen/);
  assert.match(app, /if \(event\.key === "Escape"\).*closeActiveModal/);
});

test("window controls have reserved titlebar space and non-blocking dialogs dismiss from their backdrop", () => {
  assert.match(css, /--window-controls-width:\s*138px/);
  assert.match(css, /\.titlebar\s*\{[^}]*padding:\s*0 calc\(18px \+ var\(--window-controls-width\)\) 0 18px/);
  assert.match(app, /function closeOnBackdropClick/);
  assert.match(app, /event\.target === event\.currentTarget/);
  assert.match(app, /\[els\.tasksOverlay, els\.reviewOverlay, els\.studioOverlay, els\.authOverlay, els\.extensionsOverlay, els\.screenshotOverlay, els\.cameraOverlay, els\.diagnosticsOverlay\]/);
  assert.match(main, /Dialog backdrop validation failed/);
});

test("home is centered and account settings live in an accessible brand menu", () => {
  assert.match(html, /id="brandMenuButton"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*aria-controls="brandMenu"/);
  assert.match(html, /id="brandMenu"[^>]*role="menu"[^>]*hidden/);
  assert.match(html, /id="settingsButton"[^>]*role="menuitem"/);
  assert.match(html, /id="extensionsButton"[^>]*role="menuitem"/);
  assert.match(html, /id="reviewButton"[^>]*title="Open review and collaboration"/);
  assert.match(html, /id="studioButton"[^>]*title="Open creation studio"/);
  assert.match(css, /\.titlebar-navigation\s*\{[^}]*position:absolute;left:50%;top:50%;transform:translate\(-50%,-50%\)/);
  assert.match(app, /function setBrandMenuOpen/);
  assert.match(app, /!event\.target\.closest\("\.brand-menu"\)/);
  assert.match(main, /Titlebar menu outside-click validation failed/);
});

test("home composer preserves a draft while choosing its project", () => {
  assert.match(html, /id="promptInput"[^>]*placeholder="Ask Codex, then choose a project…"/);
  assert.match(app, /const canType = state\.connected && Boolean\(state\.account\) && !state\.activeTurnId/);
  assert.match(app, /els\.prompt\.placeholder = state\.activeThread \? "Ask Codex to work on this project…" : "Ask Codex, then choose a project…"/);
  assert.match(app, /if \(!state\.activeThread\) \{\s+try \{ await chooseAndStartThread\(text, attachments\); \}/);
  assert.match(app, /state\.attachments = \[\.\.\.initialAttachments\]/);
});

test("keyboard paths cover threads, tabs, region capture, and global navigation", () => {
  assert.match(app, /els\.threadList\.addEventListener\("keydown"/);
  assert.match(app, /document\.querySelector\("\.diff-tabs"\)\.addEventListener\("keydown"/);
  assert.match(app, /els\.terminalTabs\.addEventListener\("keydown"/);
  assert.match(app, /els\.reviewTabs\.addEventListener\("keydown"/);
  assert.match(app, /els\.studioTabs\.addEventListener\("keydown"/);
  assert.match(app, /els\.regionCanvas\.addEventListener\("keydown"/);
  assert.match(app, /event\.key === "F6"/);
  assert.match(app, /event\.altKey && event\.key === "ArrowLeft"/);
  assert.match(app, /event\.shiftKey && event\.key\.toLowerCase\(\) === "b"/);
  assert.match(app, /event\.shiftKey && event\.key\.toLowerCase\(\) === "r"/);
  assert.match(app, /event\.shiftKey && event\.key\.toLowerCase\(\) === "f"/);
});

test("creation tools expose local persistence, safe search, and explicit voice state", () => {
  assert.match(html, /id="studioCanvas"[^>]*role="tabpanel"/);
  assert.match(html, /id="studioSearch"[^>]*role="tabpanel"/);
  assert.match(html, /id="studioTemplates"[^>]*role="tabpanel"/);
  assert.match(html, /id="studioVoice"[^>]*role="tabpanel"/);
  assert.match(html, /Microphone audio is streamed only during an active session/);
  assert.match(main, /clientManagedHandoffs: mode === "dictation"/);
  assert.match(main, /Search is limited to the active repository/);
  assert.match(main, /title: "Delete artifact\?"/);
  assert.match(main, /title: "Delete task template\?"/);
});

test("review mutations retain explicit confirmation boundaries", () => {
  assert.match(main, /title: "Reject this hunk\?"/);
  assert.match(main, /title: "Create Git branch\?"/);
  assert.match(main, /title: "Push branch\?"/);
  assert.match(main, /title: "Create draft pull request\?"/);
  assert.match(main, /Force push is never used/);
  assert.match(html, /Stage accepted hunks; reject only after confirmation/);
});

test("visual accessibility modes include visible focus, reduced motion, and forced colors", () => {
  assert.match(css, /:focus-visible\s*\{\s*outline:2px solid var\(--focus-ring\)/);
  assert.match(css, /html\.reduce-motion/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /html\.high-contrast/);
  assert.match(css, /@media \(forced-colors: active\)/);
});

test("Creation Studio stays reachable in a high-zoom viewport", () => {
  assert.match(css, /\.studio-overlay\s*\{[^}]*overflow:auto/);
  assert.match(css, /\.studio-dialog\s*\{[^}]*height:min\(920px,calc\(100dvh - 44px\)\)/);
  assert.match(main, /studioHighZoom/);
  assert.match(desktopCompatibility, /Studio Canvas action is clipped at high zoom/);
  assert.match(desktopCompatibility, /Studio template action is unreachable at high zoom/);
});

test("screen reader mode announces decisions and completion without streaming-token chatter", () => {
  assert.match(html, /id="screenReaderModeInput" type="checkbox"/);
  assert.match(html, /Announce completed turns and decisions without reading every streaming token/);
  assert.match(app, /function announce\(message\)/);
  assert.match(app, /announce\("Codex finished the current turn\."\)/);
  assert.match(app, /announce\("Codex needs your decision\."\)/);
  assert.match(app, /else if \(method === "item\/agentMessage\/delta"\) appendItemDelta\([^;\n]+;\n/);
});

test("release reporting requires explicit consent and describes its fixed privacy boundary", () => {
  assert.match(html, /id="reportingEnabledInput" type="checkbox"/);
  assert.match(html, /never prompts, responses, paths, logs, or credentials/);
  assert.match(html, /id="copyCompatibilityReportButton"/);
  assert.match(main, /handleIpc\("stability:setReporting"/);
  assert.match(main, /handleIpc\("stability:copyCompatibilityReport"/);
});

test("all IPC handlers and renderer navigation pass through trusted main-process guards", () => {
  assert.match(main, /function assertTrustedIpcEvent/);
  assert.match(main, /function handleIpc/);
  assert.equal((main.match(/ipcMain\.handle\(/g) || []).length, 1);
  assert.match(main, /function secureWebContents/);
  assert.match(main, /webContents\.on\("will-navigate"/);
  assert.match(main, /webContents\.setWindowOpenHandler/);
});
