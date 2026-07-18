// CodeInsight AI — Production: Distributed Tracing (Prompt 15)
// A lightweight in-memory distributed tracer. Spans are grouped by `traceId`;
// the tracer caps storage at 100 traces × 50 spans each (LRU eviction).
//
// Supports parent/child span relationships, attributes, and span events.
// Emits span lifecycle events to the event bus (as agent:event with type
// "trace:span-started" / "trace:span-ended") so they can be persisted.
//
// Use `withTrace(traceId, fn)` to scope a logical operation, and
// `tracer.startSpan(name)` to instrument sub-operations within it.

import { randomUUID } from "node:crypto";
import { eventBus } from "@/lib/agents/event-bus";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type SpanStatus = "started" | "ok" | "error" | "cancelled" | "timeout";

export interface SpanEvent {
  name: string;
  timestamp: number; // epoch ms
  attributes?: Record<string, unknown>;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number; // epoch ms
  endTime?: number; // epoch ms
  durationMs?: number;
  status: SpanStatus;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
}

export interface TraceSummary {
  traceId: string;
  spanCount: number;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: SpanStatus; // worst status across all spans
  rootSpan?: string; // name of the root span (no parent)
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const MAX_TRACES = 100;
const MAX_SPANS_PER_TRACE = 50;

// ────────────────────────────────────────────────────────────────────────────
// Tracer
// ────────────────────────────────────────────────────────────────────────────

export class Tracer {
  // traceId → array of spans (insertion order = oldest first).
  private traces = new Map<string, Span[]>();
  // Trace insertion order — for LRU eviction of oldest traces.
  private traceOrder: string[] = [];
  // Current trace context (stack of traceIds, top of stack is "current").
  private traceStack: string[] = [];

  /** Generate a new trace ID (UUID v4). */
  generateTraceId(): string {
    return randomUUID();
  }

  /** Generate a new span ID (UUID v4, truncated). */
  generateSpanId(): string {
    // 16-char hex id is sufficient for span correlation.
    return randomUUID().replace(/-/g, "").slice(0, 16);
  }

  /**
   * Start a new span. If `parentSpanId` is omitted but a current trace is
   * active, the new span will be a child of the most-recently-started span in
   * that trace (auto-parenting).
   */
  startSpan(
    name: string,
    parentSpanId?: string,
    attributes?: Record<string, unknown>,
  ): Span {
    // Determine the traceId — from the active trace context, or generate a new one.
    const traceId = this.traceStack[this.traceStack.length - 1] ?? this.generateTraceId();
    const spanId = this.generateSpanId();

    // Auto-parent: if no parentSpanId was given but a current trace has spans,
    // use the most-recently-started still-open span as the parent.
    let resolvedParent = parentSpanId;
    if (!resolvedParent) {
      const spans = this.traces.get(traceId);
      if (spans && spans.length > 0) {
        // Find the most-recent span that has no endTime yet (still open).
        for (let i = spans.length - 1; i >= 0; i--) {
          if (!spans[i].endTime) {
            resolvedParent = spans[i].spanId;
            break;
          }
        }
      }
    }

    const span: Span = {
      traceId,
      spanId,
      parentSpanId: resolvedParent,
      name,
      startTime: Date.now(),
      status: "started",
      attributes: attributes ? { ...attributes } : {},
      events: [],
    };

    this.storeSpan(span);

    // Emit an event for observability (best-effort).
    try {
      eventBus.emit({
        type: "agent:event",
        event: {
          id: spanId,
          type: "trace:span-started",
          agent: "orchestrator", // tracing is system-level; use orchestrator as the agent
          message: `Span started: ${name}`,
          level: "debug",
          timestamp: span.startTime,
          data: { traceId, spanId, parentSpanId: resolvedParent, name },
        },
      });
    } catch {
      // Never let tracing crash the app.
    }

    return span;
  }

  /** End a span, recording duration and final status. */
  endSpan(span: Span, status: SpanStatus = "ok", attributes?: Record<string, unknown>): void {
    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.status = status;
    if (attributes) {
      span.attributes = { ...span.attributes, ...attributes };
    }

    // Emit an event for observability.
    try {
      eventBus.emit({
        type: "agent:event",
        event: {
          id: span.spanId,
          type: "trace:span-ended",
          agent: "orchestrator",
          message: `Span ended: ${span.name} (${span.durationMs}ms, ${status})`,
          level: status === "error" ? "error" : "debug",
          timestamp: span.endTime,
          data: {
            traceId: span.traceId,
            spanId: span.spanId,
            durationMs: span.durationMs,
            status,
          },
        },
      });
    } catch {
      // Swallow.
    }
  }

  /** Add an event (timestamped annotation) to a span. */
  addSpanEvent(span: Span, name: string, attributes?: Record<string, unknown>): void {
    span.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
  }

  /** Set an attribute on a span. */
  setSpanAttribute(span: Span, key: string, value: unknown): void {
    span.attributes[key] = value;
  }

  /** Get all spans for the current trace (top of the trace stack). */
  getCurrentTrace(): Span[] {
    const traceId = this.traceStack[this.traceStack.length - 1];
    if (!traceId) return [];
    return this.getTrace(traceId);
  }

  /** Get all spans for a specific trace. */
  getTrace(traceId: string): Span[] {
    return this.traces.get(traceId) ?? [];
  }

  /** Get recent trace IDs (most-recent first). */
  getRecentTraces(limit: number = 20): TraceSummary[] {
    const ids = [...this.traceOrder].reverse().slice(0, limit);
    return ids.map((id) => this.summarizeTrace(id)).filter((s): s is TraceSummary => s !== null);
  }

  /**
   * Run a function within a trace context. All spans started inside `fn`
   * (without an explicit traceId) will be assigned to `traceId`.
   */
  withTrace<T>(traceId: string, fn: () => T): T {
    this.traceStack.push(traceId);
    // Ensure the trace exists in storage.
    if (!this.traces.has(traceId)) {
      this.traces.set(traceId, []);
      this.traceOrder.push(traceId);
      this.evictIfNeeded();
    }
    try {
      return fn();
    } finally {
      this.traceStack.pop();
    }
  }

  /**
   * Convenience: start a span, run `fn`, end the span with ok/error status.
   * Returns the inner result. Useful for instrumenting synchronous blocks.
   */
  traceSync<T>(name: string, fn: () => T, attributes?: Record<string, unknown>): T {
    const span = this.startSpan(name, undefined, attributes);
    try {
      const result = fn();
      this.endSpan(span, "ok");
      return result;
    } catch (err) {
      this.endSpan(span, "error", { error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  /** Async variant of `traceSync`. */
  async traceAsync<T>(name: string, fn: () => Promise<T>, attributes?: Record<string, unknown>): Promise<T> {
    const span = this.startSpan(name, undefined, attributes);
    try {
      const result = await fn();
      this.endSpan(span, "ok");
      return result;
    } catch (err) {
      this.endSpan(span, "error", { error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  /** Clear all stored traces. */
  clear(): void {
    this.traces.clear();
    this.traceOrder = [];
    this.traceStack = [];
  }

  /** Total number of stored traces. */
  get traceCount(): number {
    return this.traces.size;
  }

  /** Total number of stored spans across all traces. */
  get spanCount(): number {
    let sum = 0;
    for (const spans of this.traces.values()) sum += spans.length;
    return sum;
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private storeSpan(span: Span): void {
    let spans = this.traces.get(span.traceId);
    if (!spans) {
      spans = [];
      this.traces.set(span.traceId, spans);
      this.traceOrder.push(span.traceId);
    }
    spans.push(span);

    // Cap spans per trace (drop oldest).
    if (spans.length > MAX_SPANS_PER_TRACE) {
      spans.splice(0, spans.length - MAX_SPANS_PER_TRACE);
    }

    this.evictIfNeeded();
  }

  private evictIfNeeded(): void {
    while (this.traceOrder.length > MAX_TRACES) {
      const oldestId = this.traceOrder.shift();
      if (oldestId === undefined) break;
      this.traces.delete(oldestId);
    }
  }

  private summarizeTrace(traceId: string): TraceSummary | null {
    const spans = this.traces.get(traceId);
    if (!spans || spans.length === 0) return null;

    const startedAt = spans[0].startTime;
    const endedAt = spans.reduce((max, s) => (s.endTime && s.endTime > max ? s.endTime : max), startedAt);
    const durationMs = endedAt - startedAt;

    // Compute worst status — error > timeout > cancelled > ok > started.
    const statusPriority: Record<SpanStatus, number> = {
      started: 0,
      ok: 1,
      cancelled: 2,
      timeout: 3,
      error: 4,
    };
    let worstStatus: SpanStatus = "started";
    for (const s of spans) {
      if (statusPriority[s.status] > statusPriority[worstStatus]) {
        worstStatus = s.status;
      }
    }

    const rootSpan = spans.find((s) => !s.parentSpanId)?.name;

    return {
      traceId,
      spanCount: spans.length,
      startedAt,
      endedAt,
      durationMs,
      status: worstStatus,
      rootSpan,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Singleton + helpers
// ────────────────────────────────────────────────────────────────────────────

export const tracer = new Tracer();

/** Generate a new trace ID (UUID v4). Convenience function. */
export function generateTraceId(): string {
  return tracer.generateTraceId();
}

/** Generate a new span ID. Convenience function. */
export function generateSpanId(): string {
  return tracer.generateSpanId();
}
