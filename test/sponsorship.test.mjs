import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("repository and app expose one fixed optional GitHub Sponsors destination", () => {
  const funding = read(".github/FUNDING.yml");
  const main = read("src/main/main.mjs");
  const preload = read("src/main/preload.cjs");
  const app = read("src/renderer/app.js");
  const html = read("src/renderer/index.html");

  assert.match(funding, /^github: \[zk274\]\n$/);
  assert.match(main, /const PROJECT_SPONSOR_URL = "https:\/\/github\.com\/sponsors\/zk274";/);
  assert.match(main, /handleIpc\("project:openSponsor", \(\) => shell\.openExternal\(validateExternalUrl\(PROJECT_SPONSOR_URL\)\.toString\(\)\)\);/);
  assert.match(preload, /openSponsor: \(\) => ipcRenderer\.invoke\("project:openSponsor"\)/);
  assert.match(app, /els\.sponsorProject\.addEventListener\("click", \(\) => api\.openSponsor\(\)\.catch\(showError\)\);/);
  assert.match(html, /id="sponsorProjectButton"[^>]*aria-describedby="sponsorProjectDescription"/);
  assert.match(html, /Core features remain free and open source\./);
});

test("sponsor call to action is a settings action rather than a modal or notification", () => {
  const html = read("src/renderer/index.html");
  const main = read("src/main/main.mjs");

  const sponsorButton = html.match(/<button id="sponsorProjectButton"[\s\S]*?<\/button>/)?.[0] || "";
  assert.match(sponsorButton, /class="secondary-button"/);
  assert.doesNotMatch(sponsorButton, /primary-action/);
  assert.doesNotMatch(main, /new Notification\(\{[\s\S]{0,400}sponsor/i);
  assert.doesNotMatch(main, /showMessageBox[\s\S]{0,300}sponsor/i);
});
