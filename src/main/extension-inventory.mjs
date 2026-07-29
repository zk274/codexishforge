import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SAFE_CONFIG_ID = /^[A-Za-z0-9][A-Za-z0-9@_-]{0,199}$/;

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function errorMessage(error, fallback) {
  return text(error?.message || error, fallback).slice(0, 500);
}

function layerPath(source) {
  if (!source || typeof source !== "object") return null;
  if (typeof source.file === "string" && path.isAbsolute(source.file)) return path.normalize(source.file);
  if (source.type === "project" && typeof source.dotCodexFolder === "string" && path.isAbsolute(source.dotCodexFolder)) {
    return path.join(path.normalize(source.dotCodexFolder), "config.toml");
  }
  return null;
}

function layerKind(source) {
  if (["user", "project"].includes(source?.type)) return source.type;
  if (source?.type === "system") return "system";
  if (String(source?.type || "").startsWith("enterprise")) return "managed";
  if (String(source?.type || "").startsWith("legacyManaged")) return "managed";
  if (source?.type === "sessionFlags") return "session";
  if (source?.type === "mdm") return "managed";
  return "other";
}

function editableLayer(source) {
  return ["user", "project"].includes(source?.type);
}

export function resolveCodexHome({ env = process.env, home = os.homedir() } = {}) {
  const configured = env.CODEX_HOME;
  return typeof configured === "string" && path.isAbsolute(configured)
    ? path.normalize(configured)
    : path.join(home, ".codex");
}

export function resolveUserConfigPath(options = {}) {
  return path.join(resolveCodexHome(options), "config.toml");
}

export function configFiles(configResponse, { fallbackUserConfig = resolveUserConfigPath(), fsApi = fs } = {}) {
  const files = [];
  for (const layer of configResponse?.layers || []) {
    const filePath = layerPath(layer?.name);
    if (!filePath || files.some((entry) => entry.path === filePath)) continue;
    let exists = false;
    try { exists = fsApi.statSync(filePath).isFile(); } catch {}
    files.push({
      path: filePath,
      kind: layerKind(layer.name),
      editable: editableLayer(layer.name),
      exists,
      version: text(layer.version) || null,
    });
  }
  if (!files.some((entry) => entry.kind === "user")) {
    let exists = false;
    try { exists = fsApi.statSync(fallbackUserConfig).isFile(); } catch {}
    files.unshift({ path: fallbackUserConfig, kind: "user", editable: true, exists, version: null });
  }
  return files;
}

function originForKey(configResponse, keyPath) {
  const origins = configResponse?.origins;
  if (!origins || typeof origins !== "object") return null;
  let candidatePath = keyPath;
  while (candidatePath) {
    if (origins[candidatePath]) return origins[candidatePath];
    const prefix = `${candidatePath}.`;
    const matchingKey = Object.keys(origins).find((candidate) => candidate.startsWith(prefix));
    if (matchingKey) return origins[matchingKey];
    const separator = candidatePath.lastIndexOf(".");
    candidatePath = separator === -1 ? "" : candidatePath.slice(0, separator);
  }
  return null;
}

export function configWriteTarget(configResponse, keyPath, options = {}) {
  const files = configFiles(configResponse, options);
  const origin = originForKey(configResponse, keyPath);
  if (origin?.name) {
    const filePath = layerPath(origin.name);
    return {
      path: filePath,
      version: text(origin.version) || null,
      kind: layerKind(origin.name),
      editable: Boolean(filePath && editableLayer(origin.name)),
    };
  }
  const user = files.find((entry) => entry.kind === "user");
  return user ? { ...user } : { path: null, version: null, kind: "other", editable: false };
}

function section(value, error, available = true) {
  return {
    available,
    value: available && !error ? value : null,
    error: error ? errorMessage(error, "Codex could not load this extension section.") : null,
  };
}

function normalizeSkills(response, configResponse, fallbackUserConfig) {
  const skills = [];
  const seen = new Set();
  const errors = [];
  for (const entry of response?.data || []) {
    for (const error of entry.errors || []) {
      errors.push({ path: text(error.path) || null, message: errorMessage(error, "Skill metadata could not be read.") });
    }
    for (const skill of entry.skills || []) {
      if (!path.isAbsolute(skill.path || "") || seen.has(skill.path)) continue;
      seen.add(skill.path);
      const writeTarget = configWriteTarget(configResponse, "skills.config", { fallbackUserConfig });
      skills.push({
        id: skill.path,
        name: text(skill.name, path.basename(path.dirname(skill.path))),
        displayName: text(skill.interface?.displayName, text(skill.name, "Unnamed skill")),
        description: text(skill.interface?.shortDescription, text(skill.shortDescription, text(skill.description, "No description provided."))),
        scope: text(skill.scope, "unknown"),
        path: skill.path,
        enabled: skill.enabled !== false,
        dependencies: Array.isArray(skill.dependencies?.tools) ? skill.dependencies.tools.length : 0,
        editable: writeTarget.editable,
      });
    }
  }
  skills.sort((left, right) => left.displayName.localeCompare(right.displayName));
  return { items: skills, errors };
}

function normalizePlugins(response, configResponse, fallbackUserConfig) {
  const plugins = [];
  const errors = [];
  for (const error of response?.marketplaceLoadErrors || []) {
    errors.push({ path: text(error.marketplacePath) || null, message: errorMessage(error, "Plugin marketplace could not be loaded.") });
  }
  for (const marketplace of response?.marketplaces || []) {
    for (const plugin of marketplace.plugins || []) {
      if (plugin.installed === false) continue;
      const id = text(plugin.id, text(plugin.name));
      if (!id) continue;
      const keyPath = SAFE_CONFIG_ID.test(id) ? `plugins.${id}.enabled` : null;
      const writeTarget = keyPath ? configWriteTarget(configResponse, keyPath, { fallbackUserConfig }) : null;
      plugins.push({
        id,
        name: text(plugin.interface?.displayName, text(plugin.name, id)),
        description: text(plugin.interface?.shortDescription, text(plugin.interface?.longDescription, "Installed Codex plugin.")),
        marketplace: text(marketplace.interface?.displayName, text(marketplace.name, "Codex")),
        version: text(plugin.localVersion, text(plugin.version)) || null,
        source: text(plugin.source?.type, "unknown"),
        enabled: plugin.enabled !== false,
        editable: Boolean(keyPath && writeTarget?.editable),
        managed: plugin.availability === "DISABLED_BY_ADMIN" || plugin.installPolicy === "INSTALLED_BY_DEFAULT",
        preview: true,
      });
    }
  }
  plugins.sort((left, right) => left.name.localeCompare(right.name));
  return { items: plugins, errors };
}

function normalizeMcp(response, configResponse, fallbackUserConfig) {
  const configured = configResponse?.config?.mcp_servers;
  const configuredServers = configured && typeof configured === "object" && !Array.isArray(configured) ? configured : {};
  const liveServers = new Map((response?.data || []).map((server) => [server.name, server]));
  const names = new Set([...Object.keys(configuredServers), ...liveServers.keys()]);
  const items = [];
  for (const name of names) {
    const settings = configuredServers[name];
    const live = liveServers.get(name);
    const configuredEntry = settings && typeof settings === "object" && !Array.isArray(settings);
    const enabled = !configuredEntry || settings.enabled !== false;
    const keyPath = SAFE_CONFIG_ID.test(name) && configuredEntry ? `mcp_servers.${name}.enabled` : null;
    const writeTarget = keyPath ? configWriteTarget(configResponse, keyPath, { fallbackUserConfig }) : null;
    const authStatus = text(live?.authStatus, "unsupported");
    let status = "unavailable";
    if (!enabled) status = "disabled";
    else if (live && authStatus === "notLoggedIn") status = "needs-auth";
    else if (live) status = "ready";
    items.push({
      id: name,
      name: text(live?.serverInfo?.title, text(live?.serverInfo?.name, name)),
      configuredName: name,
      description: text(live?.serverInfo?.description, configuredEntry ? "Configured MCP server." : "MCP server provided by Codex or an installed plugin."),
      version: text(live?.serverInfo?.version) || null,
      authStatus,
      tools: live?.tools && typeof live.tools === "object" ? Object.keys(live.tools).length : 0,
      enabled,
      status,
      source: configuredEntry ? "configuration" : "plugin/runtime",
      required: configuredEntry && settings.required === true,
      editable: Boolean(keyPath && writeTarget?.editable),
    });
  }
  items.sort((left, right) => left.name.localeCompare(right.name));
  return { items, errors: [] };
}

function featureAvailable(compatibility, name) {
  return compatibility?.features?.[name]?.available !== false;
}

export function buildExtensionInventory({
  cwd,
  compatibility,
  skillsResponse = null,
  skillsError = null,
  pluginsResponse = null,
  pluginsError = null,
  mcpResponse = null,
  mcpError = null,
  configResponse = null,
  configError = null,
  fallbackUserConfig = resolveUserConfigPath(),
  fsApi = fs,
} = {}) {
  const skillAvailable = featureAvailable(compatibility, "skillInventory");
  const pluginAvailable = featureAvailable(compatibility, "pluginInventory");
  const mcpAvailable = featureAvailable(compatibility, "mcpInventory");
  const configurationAvailable = featureAvailable(compatibility, "configInventory");
  const configuration = configResponse && !configError
    ? configFiles(configResponse, { fallbackUserConfig, fsApi }).map(({ version, ...file }) => file)
    : [{ path: fallbackUserConfig, kind: "user", editable: true, exists: false }];
  const skillData = skillAvailable && !skillsError ? normalizeSkills(skillsResponse, configResponse, fallbackUserConfig) : { items: [], errors: [] };
  const pluginData = pluginAvailable && !pluginsError ? normalizePlugins(pluginsResponse, configResponse, fallbackUserConfig) : { items: [], errors: [] };
  const mcpData = mcpAvailable && !mcpError ? normalizeMcp(mcpResponse, configResponse, fallbackUserConfig) : { items: [], errors: [] };
  const issues = [
    ...skillData.errors.map((entry) => ({ section: "skills", level: "error", message: entry.message })),
    ...pluginData.errors.map((entry) => ({ section: "plugins", level: "error", message: entry.message })),
  ];
  if (skillsError) issues.push({ section: "skills", level: "error", message: errorMessage(skillsError, "Skills could not be loaded.") });
  if (pluginsError) issues.push({ section: "plugins", level: "error", message: errorMessage(pluginsError, "Plugins could not be loaded.") });
  if (mcpError) issues.push({ section: "mcp", level: "error", message: errorMessage(mcpError, "MCP server status could not be loaded.") });
  if (configError) issues.push({ section: "configuration", level: "error", message: errorMessage(configError, "Codex configuration could not be read.") });
  for (const server of mcpData.items.filter((entry) => entry.enabled && entry.status !== "ready")) {
    issues.push({
      section: "mcp",
      level: server.status === "needs-auth" ? "warning" : "error",
      message: server.status === "needs-auth" ? `${server.name} needs authentication.` : `${server.name} is configured but unavailable.`,
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    cwd: text(cwd) || null,
    summary: {
      skills: skillData.items.length,
      enabledSkills: skillData.items.filter((entry) => entry.enabled).length,
      plugins: pluginData.items.length,
      enabledPlugins: pluginData.items.filter((entry) => entry.enabled).length,
      mcpServers: mcpData.items.length,
      readyMcpServers: mcpData.items.filter((entry) => entry.status === "ready").length,
      issues: issues.length,
    },
    capabilities: {
      skillInventory: skillAvailable,
      skillManagement: featureAvailable(compatibility, "skillManagement"),
      pluginInventory: pluginAvailable,
      pluginManagement: featureAvailable(compatibility, "configManagement"),
      mcpInventory: mcpAvailable,
      mcpManagement: featureAvailable(compatibility, "configManagement") && featureAvailable(compatibility, "mcpManagement"),
      configInventory: configurationAvailable,
    },
    skills: section(skillData, skillsError, skillAvailable),
    plugins: section(pluginData, pluginsError, pluginAvailable),
    mcp: section(mcpData, mcpError, mcpAvailable),
    configuration: {
      available: configurationAvailable && !configError,
      files: configuration,
      error: configError ? errorMessage(configError, "Codex configuration could not be read.") : null,
    },
    issues,
  };
}

export function isSafeExtensionId(value) {
  return typeof value === "string" && SAFE_CONFIG_ID.test(value);
}
