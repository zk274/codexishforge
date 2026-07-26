import path from "node:path";

export const DEEP_LINK_SCHEME = "codex-linux";
export const DEEP_LINK_PREFIX = `${DEEP_LINK_SCHEME}:`;
export const MAX_DEEP_LINK_LENGTH = 8192;
export const MAX_PROJECT_PATH_LENGTH = 4096;
export const MAX_THREAD_ID_LENGTH = 128;

function invalid(message = "This Codex Linux link is not supported.") {
  const error = new Error(message);
  error.code = "INVALID_DEEP_LINK";
  return error;
}

function hasOnlySearchParams(url, expectedNames) {
  const names = [...url.searchParams.keys()];
  return names.length === expectedNames.length && expectedNames.every((name) => names.filter((candidate) => candidate === name).length === 1);
}

function assertCommonUrlShape(url) {
  if (url.protocol.toLowerCase() !== `${DEEP_LINK_SCHEME}:`) throw invalid();
  if (url.username || url.password || url.port || url.hash) throw invalid();
}

export function extractDeepLinkArgument(argv = []) {
  if (!Array.isArray(argv)) return null;
  return argv.find((argument) => (
    typeof argument === "string"
    && argument.length <= MAX_DEEP_LINK_LENGTH
    && argument.toLowerCase().startsWith(DEEP_LINK_PREFIX)
  )) || null;
}

export function parseDeepLink(value) {
  if (typeof value !== "string" || !value || value.length > MAX_DEEP_LINK_LENGTH || /[\0\r\n]/.test(value)) throw invalid();
  let url;
  try { url = new URL(value); }
  catch { throw invalid(); }
  assertCommonUrlShape(url);

  const route = url.hostname.toLowerCase();
  if (route === "open") {
    if (!["", "/"].includes(url.pathname) || url.search || !hasOnlySearchParams(url, [])) throw invalid();
    return { kind: "open" };
  }

  if (route === "thread") {
    if (url.search || !hasOnlySearchParams(url, [])) throw invalid();
    let threadId;
    try { threadId = decodeURIComponent(url.pathname.slice(1)); }
    catch { throw invalid(); }
    if (
      !url.pathname.startsWith("/")
      || threadId.length < 1
      || threadId.length > MAX_THREAD_ID_LENGTH
      || !/^[A-Za-z0-9_-]+$/.test(threadId)
    ) throw invalid("This Codex Linux thread link is invalid.");
    return { kind: "thread", threadId };
  }

  if (route === "project") {
    if ((url.pathname && url.pathname !== "/") || !hasOnlySearchParams(url, ["path"])) throw invalid();
    const candidate = url.searchParams.get("path");
    if (
      typeof candidate !== "string"
      || candidate.length < 1
      || candidate.length > MAX_PROJECT_PATH_LENGTH
      || candidate.includes("\0")
      || /[\r\n]/.test(candidate)
      || !path.isAbsolute(candidate)
    ) throw invalid("This Codex Linux project link must contain an absolute directory path.");
    return { kind: "project", cwd: path.normalize(candidate) };
  }

  throw invalid();
}
