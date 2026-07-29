import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  buildExtensionInventory,
  configFiles,
  configWriteTarget,
  isSafeExtensionId,
  resolveCodexHome,
  resolveUserConfigPath,
} from "../src/main/extension-inventory.mjs";

const userSource = { type: "user", file: "/home/example/.codex/config.toml", profile: null };
const projectSource = { type: "project", dotCodexFolder: "/workspace/project/.codex" };
const compatibility = {
  features: Object.fromEntries([
    "skillInventory",
    "skillManagement",
    "pluginInventory",
    "mcpInventory",
    "mcpManagement",
    "configInventory",
    "configManagement",
  ].map((name) => [name, { available: true, missingMethods: [] }])),
};

function configResponse() {
  return {
    config: {
      mcp_servers: {
        docs: {
          command: "secret-command",
          env: { API_TOKEN: "never-render-this" },
          enabled: true,
          required: true,
        },
        paused: { enabled: false },
      },
      plugins: { "github@openai-curated": { enabled: true } },
    },
    origins: {
      "mcp_servers.docs.command": { name: projectSource, version: "project-v1" },
      "mcp_servers.paused.enabled": { name: userSource, version: "user-v1" },
      "plugins.github@openai-curated.enabled": { name: userSource, version: "user-v1" },
    },
    layers: [
      { name: userSource, version: "user-v1", config: {} },
      { name: projectSource, version: "project-v1", config: {} },
      { name: { type: "system", file: "/etc/codex/config.toml" }, version: "system-v1", config: {} },
    ],
  };
}

const fsApi = {
  statSync(candidate) {
    return { isFile: () => candidate !== "/workspace/project/.codex/config.toml" };
  },
};

test("resolves Codex home and user configuration without accepting relative overrides", () => {
  assert.equal(resolveCodexHome({ env: { CODEX_HOME: "/custom/codex" }, home: "/home/example" }), "/custom/codex");
  assert.equal(resolveCodexHome({ env: { CODEX_HOME: "relative" }, home: "/home/example" }), "/home/example/.codex");
  assert.equal(resolveUserConfigPath({ env: {}, home: "/home/example" }), "/home/example/.codex/config.toml");
});

test("reports active configuration layers and their editability", () => {
  const files = configFiles(configResponse(), { fallbackUserConfig: "/fallback/config.toml", fsApi });
  assert.deepEqual(files.map(({ path: filePath, kind, editable, exists }) => ({ filePath, kind, editable, exists })), [
    { filePath: "/home/example/.codex/config.toml", kind: "user", editable: true, exists: true },
    { filePath: path.join("/workspace/project/.codex", "config.toml"), kind: "project", editable: true, exists: false },
    { filePath: "/etc/codex/config.toml", kind: "system", editable: false, exists: true },
  ]);
});

test("selects the owning editable layer for safe config writes", () => {
  assert.deepEqual(configWriteTarget(configResponse(), "mcp_servers.docs.enabled", { fsApi }), {
    path: "/workspace/project/.codex/config.toml",
    version: "project-v1",
    kind: "project",
    editable: true,
  });
  assert.equal(configWriteTarget(configResponse(), "plugins.github@openai-curated.enabled", { fsApi }).path, "/home/example/.codex/config.toml");
});

test("normalizes extension inventory without exposing raw configuration or credentials", () => {
  const inventory = buildExtensionInventory({
    cwd: "/workspace/project",
    compatibility,
    configResponse: configResponse(),
    fallbackUserConfig: "/home/example/.codex/config.toml",
    fsApi,
    skillsResponse: {
      data: [{
        cwd: "/workspace/project",
        errors: [],
        skills: [{
          name: "review",
          description: "Review changes",
          enabled: true,
          path: "/home/example/.codex/skills/review/SKILL.md",
          scope: "user",
          dependencies: { tools: [{ type: "command", value: "git" }] },
        }],
      }],
    },
    pluginsResponse: {
      marketplaceLoadErrors: [],
      marketplaces: [{
        name: "openai-curated",
        plugins: [{
          id: "github@openai-curated",
          name: "github",
          installed: true,
          enabled: true,
          installPolicy: "AVAILABLE",
          availability: "AVAILABLE",
          source: { type: "remote" },
          interface: { displayName: "GitHub", shortDescription: "GitHub workflows" },
        }],
      }],
    },
    mcpResponse: {
      data: [{
        name: "docs",
        authStatus: "bearerToken",
        tools: { search: { name: "search" }, fetch: { name: "fetch" } },
        resourceTemplates: [],
        resources: [],
        serverInfo: { name: "docs", title: "Docs", version: "1.0.0", description: "Documentation" },
      }],
      nextCursor: null,
    },
  });

  assert.deepEqual(inventory.summary, {
    skills: 1,
    enabledSkills: 1,
    plugins: 1,
    enabledPlugins: 1,
    mcpServers: 2,
    readyMcpServers: 1,
    issues: 0,
  });
  assert.equal(inventory.skills.value.items[0].dependencies, 1);
  assert.equal(inventory.plugins.value.items[0].editable, true);
  assert.equal(inventory.mcp.value.items.find((entry) => entry.id === "docs").status, "ready");
  assert.equal(inventory.mcp.value.items.find((entry) => entry.id === "paused").status, "disabled");
  const serialized = JSON.stringify(inventory);
  assert.doesNotMatch(serialized, /never-render-this|secret-command|API_TOKEN/);
});

test("surfaces health issues and capability-gates unavailable preview APIs", () => {
  const result = buildExtensionInventory({
    cwd: "/workspace/project",
    compatibility: {
      features: {
        skillInventory: { available: true },
        pluginInventory: { available: false },
        mcpInventory: { available: true },
        configInventory: { available: true },
      },
    },
    configResponse: {
      ...configResponse(),
      config: { mcp_servers: { broken: { enabled: true } } },
    },
    skillsResponse: { data: [{ cwd: "/workspace/project", skills: [], errors: [{ path: "/bad/SKILL.md", message: "Invalid frontmatter" }] }] },
    mcpResponse: { data: [], nextCursor: null },
  });
  assert.equal(result.plugins.available, false);
  assert.equal(result.plugins.value, null);
  assert.equal(result.summary.issues, 2);
  assert.ok(result.issues.some((issue) => issue.message.includes("Invalid frontmatter")));
  assert.ok(result.issues.some((issue) => issue.message.includes("broken")));
});

test("accepts only bounded identifiers for dotted config writes", () => {
  assert.equal(isSafeExtensionId("github@openai-curated"), true);
  assert.equal(isSafeExtensionId("docs-server_2"), true);
  assert.equal(isSafeExtensionId("server.with.dot"), false);
  assert.equal(isSafeExtensionId("../escape"), false);
});
