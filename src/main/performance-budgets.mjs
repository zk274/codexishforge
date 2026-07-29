export const PERFORMANCE_BUDGETS = Object.freeze({
  appReady: 5_000,
  bootstrap: 6_000,
  threadRender: 50,
  messageRender: 120,
  diffParse: 250,
  terminalRender: 24,
});

const METRIC_NAMES = new Set(Object.keys(PERFORMANCE_BUDGETS));

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

export function validatePerformanceMetric({ name, durationMs } = {}) {
  if (!METRIC_NAMES.has(name)) throw new TypeError("Performance metric is not recognized");
  const duration = Number(durationMs);
  if (!Number.isFinite(duration) || duration < 0 || duration > 120_000) throw new RangeError("Performance duration is invalid");
  return { name, durationMs: Math.round(duration * 100) / 100 };
}

export class PerformanceLedger {
  constructor({ budgets = PERFORMANCE_BUDGETS, sampleLimit = 120 } = {}) {
    this.budgets = { ...budgets };
    this.sampleLimit = Math.max(10, Math.min(1_000, sampleLimit));
    this.samples = new Map();
  }

  record(name, durationMs) {
    const metric = validatePerformanceMetric({ name, durationMs });
    const samples = this.samples.get(metric.name) || [];
    samples.push(metric.durationMs);
    if (samples.length > this.sampleLimit) samples.splice(0, samples.length - this.sampleLimit);
    this.samples.set(metric.name, samples);
    return metric;
  }

  async measure(name, operation) {
    const start = performance.now();
    try { return await operation(); }
    finally { this.record(name, performance.now() - start); }
  }

  snapshot() {
    const metrics = {};
    for (const [name, budgetMs] of Object.entries(this.budgets)) {
      const samples = this.samples.get(name) || [];
      const lastMs = samples.at(-1) ?? null;
      const p95Ms = percentile(samples, 0.95);
      metrics[name] = {
        budgetMs,
        samples: samples.length,
        lastMs,
        p95Ms,
        withinBudget: p95Ms === null || p95Ms <= budgetMs,
      };
    }
    return {
      budgets: { ...this.budgets },
      metrics,
      healthy: Object.values(metrics).every((metric) => metric.withinBudget),
    };
  }
}
