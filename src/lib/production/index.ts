// CodeInsight AI — Production Hardening (Prompt 15)
// Barrel re-export of all production-grade infrastructure modules.
//
// Submodules:
//   - logger.ts           — structured leveled logging with ring buffer + event-bus integration
//   - metrics.ts          — counters / gauges / timings / histograms with p50/p95/p99 summary
//   - tracing.ts          — distributed tracer with span hierarchy and context propagation
//   - rate-limiter.ts     — token-bucket rate limiter with named-registry and defaults
//   - graceful-shutdown.ts — signal-aware shutdown coordinator with handler timeouts
//   - cache.ts            — LRU cache with per-entry TTL and hit/miss stats

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

// Rate limiter
export {
  RateLimiter,
  RateLimiterRegistry,
  rateLimiter,
  initDefaultLimiters,
  type AcquireResult,
} from "./rate-limiter";

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

// Convenience: initialize everything (call once at app boot).
// These imports bring the names into the local scope for use in
// `initProduction()` below. The public re-exports above already expose them
// to consumers; we don't need to re-export the locals again.
import { initEventPersister } from "@/lib/agents/event-persister";
import { initDefaultLimiters } from "./rate-limiter";
import { initGracefulShutdown } from "./graceful-shutdown";

// Re-export initEventPersister — it isn't covered by a section block above.
export { initEventPersister };

/**
 * One-shot initialization of all production hardening modules. Call once at
 * app boot (e.g. instrumentation.ts) — idempotent.
 *
 * Wires up:
 *   - Default rate limiters (api/ai/terminal/git)
 *   - Graceful shutdown signal listeners + default cleanup handlers
 *   - Event persister (subscribes to event bus → AgentTask/AgentEvent tables)
 */
export function initProduction(): void {
  initDefaultLimiters();
  initGracefulShutdown();
  initEventPersister();
}
