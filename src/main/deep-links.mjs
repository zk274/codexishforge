import path from "node:path";
import { APP_NAME, APP_URL_SCHEME, LEGACY_APP_URL_SCHEME } from "../shared/app-identity.mjs";

export const DEEP_LINK_SCHEME = APP_URL_SCHEME;
export const DEEP_LINK_PREFIX = `${DEEP_LINK_SCHEME}:`;
export const LEGACY_DEEP_LINK_SCHEME = LEGACY_APP_URL_SCHEME;
export const LEGACY_DEEP_LINK_PREFIX = `${LEGACY_DEEP_LINK_SCHEME}:`;
export const DEEP_LINK_SCHEMES = Object.freeze([DEEP_LINK_SCHEME, LEGACY_DEEP_LINK_SCHEME]);
export const MAX_DEEP_LINK_LENGTH = 8192;
export const MAX_PROJECT_PATH_LENGTH = 4096;
export const MAX_THREAD_ID_LENGTH = 128;

function invalid(message = `This ${APP_NAME} link is not supported.`) {
  const error = new Error(message);
  error.code = "INVALID_DEEP_LINK";
  return error;
}

function hasOnlySearchParams(url, expectedNames) {
  const names = [...url.searchParams.keys()];
  return names.length === expectedNames.length && expectedNames.every((name) => names.filter((candidate) => candidate === name).length === 1);
}

function assertCommonUrlShape(url) {
  if (!DEEP_LINK_SCHEMES.some((scheme) => url.protocol.toLowerCase() === `${scheme}:`)) throw invalid();
  if (url.username || url.password || url.port || url.hash) throw invalid();
}

export function extractDeepLinkArgument(argv = []) {
  if (!Array.isArray(argv)) return null;
  return argv.find((argument) => (
    typeof argument === "string"
    && argument.length <= MAX_DEEP_LINK_LENGTH
    && DEEP_LINK_SCHEMES.some((scheme) => argument.toLowerCase().startsWith(`${scheme}:`))
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

  if (route === "quick-prompt") {
    if (!["", "/"].includes(url.pathname) || url.search || !hasOnlySearchParams(url, [])) throw invalid();
    return { kind: "quickPrompt" };
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
    ) throw invalid(`This ${APP_NAME} thread link is invalid.`);
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
    ) throw invalid(`This ${APP_NAME} project link must contain an absolute directory path.`);
    return { kind: "project", cwd: path.normalize(candidate) };
  }

  throw invalid();
}
