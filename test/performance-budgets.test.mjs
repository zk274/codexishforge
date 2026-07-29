import assert from "node:assert/strict";
import test from "node:test";
import { PerformanceLedger, validatePerformanceMetric } from "../src/main/performance-budgets.mjs";

test("performance ledger keeps bounded samples and reports budget health", () => {
  const ledger = new PerformanceLedger({ budgets: { threadRender: 50 }, sampleLimit: 10 });
  for (let index = 0; index < 15; index += 1) ledger.record("threadRender", index);
  const snapshot = ledger.snapshot();
  assert.equal(snapshot.metrics.threadRender.samples, 10);
  assert.equal(snapshot.metrics.threadRender.withinBudget, true);
  assert.equal(snapshot.healthy, true);
});

test("performance metrics reject invented names and unbounded durations", () => {
  assert.throws(() => validatePerformanceMetric({ name: "secret", durationMs: 1 }), /recognized/);
  assert.throws(() => validatePerformanceMetric({ name: "bootstrap", durationMs: 999_999 }), /invalid/);
});
