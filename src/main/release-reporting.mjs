const ALLOWED_KINDS = new Set(["crash", "compatibility"]);

function bounded(value, limit) {
  return typeof value === "string" ? value.replace(/[\r\n]+/g, " ").slice(0, limit) : null;
}

export function normalizeReportingPreferences(value = {}) {
  const candidate = value && typeof value === "object" ? value : {};
  return {
    enabled: candidate.enabled === true,
  };
}

function reportingEndpoint(value) {
  if (typeof value !== "string" || value.length > 2_048 || /[\r\n\0]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export function releaseReport(kind, details = {}, { appVersion = null, platform = process.platform, arch = process.arch } = {}) {
  if (!ALLOWED_KINDS.has(kind)) throw new TypeError("Only crash and compatibility reports are supported");
  return {
    schemaVersion: 1,
    kind,
    appVersion: bounded(appVersion, 40),
    platform: bounded(platform, 40),
    arch: bounded(arch, 40),
    reason: bounded(details.reason, 160),
    codexVersion: bounded(details.codexVersion, 120),
    protocolStatus: bounded(details.protocolStatus, 40),
    protocolProfile: bounded(details.protocolProfile, 80),
    missingMethods: Array.isArray(details.missingMethods) ? details.missingMethods.filter((value) => typeof value === "string").slice(0, 30).map((value) => bounded(value, 160)) : [],
    occurredAt: new Date().toISOString(),
  };
}

export class ReleaseReporter {
  constructor({ preferences = {}, endpoint = null, transport = null, onReport = () => {} } = {}) {
    this.preferences = normalizeReportingPreferences(preferences);
    this.endpoint = reportingEndpoint(endpoint);
    this.transport = transport;
    this.onReport = onReport;
    this.lastResult = null;
  }

  setPreferences(value) {
    this.preferences = normalizeReportingPreferences(value);
    return this.snapshot();
  }

  snapshot() {
    return {
      preferences: { ...this.preferences },
      endpointConfigured: Boolean(this.endpoint && this.transport),
      lastResult: this.lastResult ? { ...this.lastResult } : null,
    };
  }

  async submit(report) {
    if (!this.preferences.enabled) return { sent: false, reason: "disabled" };
    if (!this.endpoint || typeof this.transport !== "function") return { sent: false, reason: "no-endpoint" };
    const normalized = releaseReport(report.kind, report, report);
    await this.transport(this.endpoint, normalized);
    this.lastResult = { sent: true, kind: normalized.kind, at: normalized.occurredAt };
    this.onReport(this.snapshot());
    return { sent: true, report: normalized };
  }
}
