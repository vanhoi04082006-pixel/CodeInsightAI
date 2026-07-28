// CodeInsight AI — Production Hardening
// Barrel re-export of all production-grade infrastructure modules.
//
// Submodules:
//   - logger.ts           — structured leveled logging with ring buffer + console output
//   - metrics.ts          — counters / gauges / timings / histograms with p50/p95/p99 summary
//   - tracing.ts          — distributed tracer with span hierarchy and context propagation
//   - graceful-shutdown.ts — signal-aware shutdown coordinator with handler timeouts
//   - cache.ts            — LRU cache with per-entry TTL and hit/miss stats
// Note: rate-limiter.ts was removed (replaced by src/lib/rate-limiter.ts DB-backed)

// Logger
export {
  Logger,
  logger,
  createLogger,
  withTraceLog,
  type LogLevel,
  type LogEntry,
} from "./logger";

// Metrics
export {
  MetricsCollector,
  metrics,
  timeAsync,
  timeSync,
  type Metric,
  type MetricType,
  type MetricSummary,
} from "./metrics";

// Tracing
export {
  Tracer,
  tracer,
  generateTraceId,
  generateSpanId,
  type Span,
  type SpanEvent,
  type SpanStatus,
  type TraceSummary,
} from "./tracing";

// Graceful shutdown
export {
  shutdownHandler,
  initGracefulShutdown,
  type ShutdownHandler as ShutdownHandlerConfig,
  type ShutdownResult,
  type ShutdownCallback,
} from "./graceful-shutdown";

// Cache
export {
  Cache,
  createCache,
  getCache,
  listCaches,
  clearAllCaches,
  type CacheStats,
} from "./cache";

import { initGracefulShutdown } from "./graceful-shutdown";

/**
 * One-shot initialization of all production hardening modules. Call once at
 * app boot (e.g. instrumentation.ts) — idempotent.
 */
export function initProduction(): void {
  initGracefulShutdown();
}
