import assert from "node:assert/strict";
import test from "node:test";
import { ReleaseReporter, releaseReport } from "../src/main/release-reporting.mjs";

test("release reporting is disabled by default and limited to safe report kinds", async () => {
  let calls = 0;
  const reporter = new ReleaseReporter({ endpoint: "https://example.com/report", transport: async () => { calls += 1; } });
  assert.deepEqual(await reporter.submit(releaseReport("crash", { reason: "renderer" })), { sent: false, reason: "disabled" });
  assert.equal(calls, 0);
  assert.throws(() => releaseReport("usage", {}), /crash and compatibility/);
});

test("opted-in reports contain bounded compatibility data and no arbitrary fields", async () => {
  let payload;
  const reporter = new ReleaseReporter({
    preferences: { enabled: true },
    endpoint: "https://example.com/report",
    transport: async (_endpoint, value) => { payload = value; },
  });
  const result = await reporter.submit({
    ...releaseReport("compatibility", { reason: "missing method", missingMethods: ["turn/start"] }, { appVersion: "0.9.0" }),
    token: "must-not-pass",
  });
  assert.equal(result.sent, true);
  assert.equal(payload.appVersion, "0.9.0");
  assert.equal("token" in payload, false);
});

test("reporting endpoints must be credential-free HTTPS URLs", () => {
  for (const endpoint of [
    "http://reports.example.test/v1",
    "https://user:password@reports.example.test/v1",
    "https://",
    "not a URL",
  ]) {
    const reporter = new ReleaseReporter({ preferences: { enabled: true }, endpoint, transport: async () => {} });
    assert.equal(reporter.snapshot().endpointConfigured, false);
  }
  const reporter = new ReleaseReporter({
    preferences: { enabled: true },
    endpoint: "https://reports.example.test/v1",
    transport: async () => {},
  });
  assert.equal(reporter.snapshot().endpointConfigured, true);
});
