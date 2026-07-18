// CodeInsight AI — Production: Metrics Collector (Prompt 15)
// In-memory metrics collection with counters, gauges, timings, and histograms.
// Each metric name has its own ring buffer capped at 10,000 entries.
// Includes percentile-based summary stats (p50/p95/p99) for histogram metrics.

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type MetricType = "counter" | "gauge" | "timing" | "histogram";

export interface Metric {
  name: string;
  type: MetricType;
  value: number;
  tags?: Record<string, string>;
  timestamp: number; // epoch ms
}

export interface MetricSummary {
  name: string;
  type: MetricType;
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  lastValue: number;
  lastUpdated: number;
  // For gauges — the current value (last set).
  current?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const MAX_ENTRIES_PER_METRIC = 10_000;

// ────────────────────────────────────────────────────────────────────────────
// MetricsCollector
// ────────────────────────────────────────────────────────────────────────────

export class MetricsCollector {
  // Ring buffer per metric name.
  private buffers = new Map<string, Metric[]>();
  // Track the type per metric name (so summary stats can be computed correctly).
  private types = new Map<string, MetricType>();

  /** Increment a counter by `count` (default 1). */
  increment(name: string, tags?: Record<string, string>, count: number = 1): void {
    this.record(name, "counter", count, tags);
  }

  /** Set a gauge to an absolute value. */
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.record(name, "gauge", value, tags);
  }

  /** Record a timing (in ms). */
  timing(name: string, durationMs: number, tags?: Record<string, string>): void {
    this.record(name, "timing", durationMs, tags);
  }

  /** Record a histogram sample (arbitrary numeric value). */
  histogram(name: string, value: number, tags?: Record<string, string>): void {
    this.record(name, "histogram", value, tags);
  }

  /**
   * Retrieve buffered metrics. Optionally filtered by name.
   * Returns most-recent first, limited to `limit` entries.
   */
  getMetrics(name?: string, limit: number = 100): Metric[] {
    if (name) {
      const buf = this.buffers.get(name);
      if (!buf) return [];
      return buf.slice(-limit).reverse();
    }
    // Aggregate across all metric names.
    const all: Metric[] = [];
    for (const buf of this.buffers.values()) {
      all.push(...buf);
    }
    return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  /** Get a summary for a single metric, or all metrics if no name given. */
  getSummary(name?: string): MetricSummary | MetricSummary[] {
    if (name) {
      return this.summarize(name);
    }
    return Array.from(this.buffers.keys()).map((n) => this.summarize(n));
  }

  /** Export all metrics as a JSON string. */
  exportJSON(): string {
    const out: Record<string, Metric[]> = {};
    for (const [name, buf] of this.buffers) {
      out[name] = buf;
    }
    return JSON.stringify(
      {
        version: 1,
        exportedAt: Date.now(),
        metricNames: Array.from(this.buffers.keys()),
        metrics: out,
      },
      null,
      2,
    );
  }

  /** Clear all metrics, or just one named metric. */
  clear(name?: string): void {
    if (name) {
      this.buffers.delete(name);
      this.types.delete(name);
    } else {
      this.buffers.clear();
      this.types.clear();
    }
  }

  /** Total number of metrics tracked. */
  get size(): number {
    return this.buffers.size;
  }

  /** Total number of samples across all metrics. */
  get totalSamples(): number {
    let sum = 0;
    for (const buf of this.buffers.values()) sum += buf.length;
    return sum;
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private record(name: string, type: MetricType, value: number, tags?: Record<string, string>): void {
    let buf = this.buffers.get(name);
    if (!buf) {
      buf = [];
      this.buffers.set(name, buf);
    }
    this.types.set(name, type);

    buf.push({
      name,
      type,
      value,
      tags,
      timestamp: Date.now(),
    });

    // Ring buffer eviction.
    if (buf.length > MAX_ENTRIES_PER_METRIC) {
      buf.splice(0, buf.length - MAX_ENTRIES_PER_METRIC);
    }
  }

  private summarize(name: string): MetricSummary {
    const buf = this.buffers.get(name) ?? [];
    const type = this.types.get(name) ?? "counter";

    if (buf.length === 0) {
      return {
        name,
        type,
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        lastValue: 0,
        lastUpdated: 0,
      };
    }

    const values = buf.map((m) => m.value);
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const last = buf[buf.length - 1];

    return {
      name,
      type,
      count: buf.length,
      sum,
      avg: sum / buf.length,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      lastValue: last.value,
      lastUpdated: last.timestamp,
      current: type === "gauge" ? last.value : undefined,
    };
  }
}

/** Compute a percentile from a *sorted ascending* array. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  // Linear interpolation between the two nearest values.
  const frac = idx - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

// ────────────────────────────────────────────────────────────────────────────
// Singleton
// ────────────────────────────────────────────────────────────────────────────

export const metrics = new MetricsCollector();

/**
 * Convenience: time an async operation and record the duration under `name`.
 * Returns the inner result.
 *
 * @example
 * const result = await metrics.time("db.query", async () => db.user.findMany());
 */
export async function timeAsync<T>(name: string, fn: () => Promise<T>, tags?: Record<string, string>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    metrics.timing(name, Date.now() - start, tags);
  }
}

/** Synchronous variant of `timeAsync`. */
export function timeSync<T>(name: string, fn: () => T, tags?: Record<string, string>): T {
  const start = Date.now();
  try {
    return fn();
  } finally {
    metrics.timing(name, Date.now() - start, tags);
  }
}
