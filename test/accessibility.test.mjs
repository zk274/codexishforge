import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/renderer/app.js", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main/main.mjs", import.meta.url), "utf8");

test("primary navigation and changing status have accessible semantics", () => {
  assert.match(html, /class="skip-link" href="#conversation"/);
  assert.match(html, /id="conversation"[^>]*tabindex="-1"[^>]*aria-label=/);
  assert.match(html, /id="toast"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /id="regionStatus" aria-live="polite"/);
});

test("every modal dialog is named and modal focus is contained", () => {
  const dialogs = [...html.matchAll(/<(?:section|div)[^>]*role="dialog"[^>]*>/g)].map(([tag]) => tag);
  assert.equal(dialogs.length, 7);
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
  assert.match(app, /\[els\.authOverlay, els\.extensionsOverlay, els\.screenshotOverlay, els\.cameraOverlay, els\.diagnosticsOverlay\]/);
  assert.match(main, /Dialog backdrop validation failed/);
});

test("home is centered and account settings live in an accessible brand menu", () => {
  assert.match(html, /id="brandMenuButton"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*aria-controls="brandMenu"/);
  assert.match(html, /id="brandMenu"[^>]*role="menu"[^>]*hidden/);
  assert.match(html, /id="settingsButton"[^>]*role="menuitem"/);
  assert.match(html, /id="extensionsButton"[^>]*role="menuitem"/);
  assert.match(css, /\.titlebar-navigation\s*\{[^}]*position:absolute;left:50%;top:50%;transform:translate\(-50%,-50%\)/);
  assert.match(app, /function setBrandMenuOpen/);
  assert.match(app, /!event\.target\.closest\("\.brand-menu"\)/);
  assert.match(main, /Titlebar menu outside-click validation failed/);
});

test("keyboard paths cover threads, tabs, region capture, and global navigation", () => {
  assert.match(app, /els\.threadList\.addEventListener\("keydown"/);
  assert.match(app, /document\.querySelector\("\.diff-tabs"\)\.addEventListener\("keydown"/);
  assert.match(app, /els\.terminalTabs\.addEventListener\("keydown"/);
  assert.match(app, /els\.regionCanvas\.addEventListener\("keydown"/);
  assert.match(app, /event\.key === "F6"/);
  assert.match(app, /event\.altKey && event\.key === "ArrowLeft"/);
});

test("visual accessibility modes include visible focus, reduced motion, and forced colors", () => {
  assert.match(css, /:focus-visible\s*\{\s*outline:2px solid var\(--focus-ring\)/);
  assert.match(css, /html\.reduce-motion/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /html\.high-contrast/);
  assert.match(css, /@media \(forced-colors: active\)/);
});
