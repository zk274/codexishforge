import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export function validateExternalUrl(rawUrl, { allowMailto = false } = {}) {
  if (typeof rawUrl !== "string" || rawUrl.length < 1 || rawUrl.length > 2_048 || /[\r\n\0]/.test(rawUrl)) throw new TypeError("External URL is invalid");
  const url = new URL(rawUrl);
  const allowed = url.protocol === "https:" || (allowMailto && url.protocol === "mailto:");
  if (!allowed || url.username || url.password) throw new Error("Only credential-free HTTPS links are allowed");
  if (url.protocol === "https:" && !url.hostname) throw new Error("External HTTPS link requires a host");
  return url;
}

export function trustedRendererUrl(rawUrl, rendererRoot) {
  if (typeof rawUrl !== "string" || !path.isAbsolute(rendererRoot)) return false;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "file:" || url.username || url.password || url.search || url.hash) return false;
    const filePath = path.normalize(fileURLToPath(url));
    const root = path.normalize(rendererRoot);
    return [path.join(root, "index.html"), path.join(root, "companion.html")].includes(filePath);
  } catch {
    return false;
  }
}

export function validateAttachmentPath(candidate, { fsApi = fs, maxBytes = MAX_ATTACHMENT_BYTES } = {}) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate) || candidate.includes("\0")) throw new TypeError("Attachment paths must be absolute");
  const linkStat = fsApi.lstatSync(candidate);
  if (linkStat.isSymbolicLink()) throw new Error("Symbolic links cannot be attached");
  const realPath = fsApi.realpathSync(candidate);
  const stat = fsApi.statSync(realPath);
  if (!stat.isFile()) throw new Error("Only regular files can be attached");
  if (stat.size > maxBytes) throw new Error(`Attachments are limited to ${Math.floor(maxBytes / (1024 * 1024))} MB`);
  return { realPath: path.normalize(realPath), stat };
}

export function securitySnapshot() {
  return {
    ipcSenderValidation: true,
    trustedRendererNavigation: true,
    externalLinks: "credential-free-https",
    attachmentLimitBytes: MAX_ATTACHMENT_BYTES,
    symlinkAttachments: false,
    updater: "validated-metadata-sha512-and-explicit-download",
    diagnosticsRedaction: true,
  };
}
