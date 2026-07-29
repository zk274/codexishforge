import fs from "node:fs";
import path from "node:path";

const POLICY_FILES = [
  ["AGENTS.md", "Codex guidance"],
  [".codex/config.toml", "Project Codex configuration"],
  [".codex/requirements.toml", "Managed Codex requirements"],
  ["CONTRIBUTING.md", "Contribution guide"],
  [".github/CONTRIBUTING.md", "Contribution guide"],
  [".github/CODEOWNERS", "Code owners"],
  ["CODEOWNERS", "Code owners"],
  [".gitlab/CODEOWNERS", "Code owners"],
  ["SECURITY.md", "Security policy"],
  [".github/pull_request_template.md", "Pull-request template"],
];

function safeRelative(candidate) {
  const normalized = path.normalize(candidate);
  return !path.isAbsolute(normalized) && normalized !== ".." && !normalized.startsWith(`..${path.sep}`);
}

function item(root, relativePath, kind) {
  if (!safeRelative(relativePath)) return null;
  const absolute = path.join(root, relativePath);
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) return null;
    return { kind, path: relativePath, bytes: stat.size };
  } catch {
    return null;
  }
}

function workflowItems(root) {
  const directory = path.join(root, ".github", "workflows");
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
      .slice(0, 50)
      .map((entry) => item(root, path.join(".github", "workflows", entry.name), "GitHub Actions workflow"))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function hookItems(root, hooksPath = null) {
  const directory = hooksPath
    ? (path.isAbsolute(hooksPath) ? hooksPath : path.join(root, hooksPath))
    : path.join(root, ".git", "hooks");
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.endsWith(".sample"))
      .slice(0, 50)
      .map((entry) => ({ kind: "Git hook", path: path.relative(root, path.join(directory, entry.name)), bytes: fs.statSync(path.join(directory, entry.name)).size }))
      .filter((entry) => safeRelative(entry.path));
  } catch {
    return [];
  }
}

export function repositoryPolicySnapshot(root, { hooksPath = null, remote = null } = {}) {
  if (typeof root !== "string" || !path.isAbsolute(root)) throw new TypeError("Repository root must be absolute");
  const files = [
    ...POLICY_FILES.map(([relativePath, kind]) => item(root, relativePath, kind)).filter(Boolean),
    ...workflowItems(root),
    ...hookItems(root, hooksPath),
  ];
  const counts = Object.fromEntries([...new Set(files.map((entry) => entry.kind))].map((kind) => [kind, files.filter((entry) => entry.kind === kind).length]));
  return {
    root,
    files,
    counts,
    hooksPath: hooksPath || ".git/hooks",
    remote: remote ? {
      available: remote.available !== false,
      protected: remote.protected === true,
      requiredChecks: Array.isArray(remote.requiredChecks) ? remote.requiredChecks.slice(0, 50) : [],
      requiredReviews: Number.isInteger(remote.requiredReviews) ? remote.requiredReviews : 0,
      requireCodeOwners: remote.requireCodeOwners === true,
      requireConversationResolution: remote.requireConversationResolution === true,
      enforceAdmins: remote.enforceAdmins === true,
      error: typeof remote.error === "string" ? remote.error.slice(0, 300) : null,
    } : null,
  };
}
