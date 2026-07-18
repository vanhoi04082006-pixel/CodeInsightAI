// CodeInsight AI — Production: Structured Logger (Prompt 15)
// A structured logger with leveled logging, colorized console output, an
// in-memory ring buffer (last 1000 entries), JSON/JSONL export, and event-bus
// integration (emits each log as a `{ type: "log", ... }` event so other
// modules — e.g. event-persister — can durably store them).
//
// The `agent` field on emitted events is optional; module-scoped loggers
// created via `createLogger(module)` will populate `agent` with the module
// name when it matches a known AgentId.

import { eventBus } from "@/lib/agents/event-bus";
import type { AgentId } from "@/lib/agents/types";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  timestamp: number; // epoch ms
  level: LogLevel;
  message: string;
  module?: string;
  meta?: Record<string, unknown>;
  traceId?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const MAX_BUFFER = 1000;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

// ANSI colors — kept minimal so the output is readable on any terminal.
const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: "\x1b[90m",  // gray
  info: "\x1b[36m",   // cyan
  warn: "\x1b[33m",   // yellow
  error: "\x1b[31m",  // red
  fatal: "\x1b[35m",  // magenta
};
const RESET_COLOR = "\x1b[0m";
const BOLD = "\x1b[1m";

// Map of known agent IDs — used to populate the `agent` field on emitted
// log events when the module name matches.
const KNOWN_AGENTS = new Set<AgentId>([
  "orchestrator", "planner", "repository-analyst", "code-reviewer",
  "bug-fixer", "refactoring-agent", "documentation-agent", "test-agent",
  "security-agent", "performance-agent", "devops-agent",
]);

// ────────────────────────────────────────────────────────────────────────────
// Logger
// ────────────────────────────────────────────────────────────────────────────

export class Logger {
  private buffer: LogEntry[] = [];
  private minLevel: LogLevel = "debug";
  private readonly moduleName?: string;

  constructor(moduleName?: string) {
    this.moduleName = moduleName;
    // Allow overriding the minimum log level via env var.
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    if (envLevel && envLevel in LEVEL_PRIORITY) {
      this.minLevel = envLevel as LogLevel;
    }
  }

  /** Set the minimum level at runtime. */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /** Returns the current minimum log level. */
  getLevel(): LogLevel {
    return this.minLevel;
  }

  // ── Convenience methods ────────────────────────────────────────────────

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log("debug", message, meta);
  }
  info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, meta);
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, meta);
  }
  error(message: string, meta?: Record<string, unknown>): void {
    this.log("error", message, meta);
  }
  fatal(message: string, meta?: Record<string, unknown>): void {
    this.log("fatal", message, meta);
  }

  /** Core log method — emits, buffers, prints, and publishes to event bus. */
  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      module: this.moduleName,
      meta,
      // traceId is set via `withTrace()` or by explicit meta.traceId
      traceId: (meta?.traceId as string | undefined) ?? this.currentTraceId,
    };

    // Buffer (ring buffer of last MAX_BUFFER entries)
    this.buffer.push(entry);
    if (this.buffer.length > MAX_BUFFER) {
      this.buffer.shift();
    }

    // Console output (colorized)
    this.writeToConsole(entry);

    // Emit on the event bus (so event-persister can persist to AgentEvent).
    // Note: EventBusEvent.log.level doesn't include "fatal" — map to "error".
    try {
      eventBus.emit({
        type: "log",
        level: level === "fatal" ? "error" : level,
        message: this.moduleName ? `[${this.moduleName}] ${message}` : message,
        agent: this.resolveAgent(),
      });
    } catch {
      // Event bus should never throw, but if it does we silently swallow —
      // logging must not crash the application.
    }
  }

  /** Retrieve buffered logs (newest first by default). */
  getLogs(level?: LogLevel, limit: number = 100): LogEntry[] {
    let logs = this.buffer;
    if (level) {
      logs = logs.filter((e) => e.level === level);
    }
    return logs.slice(-limit).reverse();
  }

  /** Export all buffered logs as a JSON string. */
  exportJSON(): string {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: Date.now(),
        count: this.buffer.length,
        entries: this.buffer,
      },
      null,
      2,
    );
  }

  /** Export all buffered logs as JSONL (one entry per line). */
  exportJSONL(): string {
    return this.buffer.map((e) => JSON.stringify(e)).join("\n");
  }

  /** Clear the in-memory buffer. */
  clear(): void {
    this.buffer = [];
  }

  /** Number of buffered entries. */
  get size(): number {
    return this.buffer.length;
  }

  // ── Trace context (very lightweight) ───────────────────────────────────
  // The Tracer module sets the current trace ID via `withTrace()` — log
  // entries emitted within that scope will have `traceId` populated.

  private currentTraceId: string | undefined;

  /** Set the current trace context (called by Tracer.withTrace). */
  _setTraceId(traceId: string | undefined): void {
    this.currentTraceId = traceId;
  }

  /** Run a function with a trace ID bound to all log entries emitted inside. */
  withTrace<T>(traceId: string, fn: () => T): T {
    const prev = this.currentTraceId;
    this.currentTraceId = traceId;
    try {
      return fn();
    } finally {
      this.currentTraceId = prev;
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private resolveAgent(): AgentId | undefined {
    if (!this.moduleName) return undefined;
    if (KNOWN_AGENTS.has(this.moduleName as AgentId)) {
      return this.moduleName as AgentId;
    }
    return undefined;
  }

  private writeToConsole(entry: LogEntry): void {
    const ts = new Date(entry.timestamp).toISOString();
    const levelLabel = entry.level.toUpperCase().padEnd(5);
    const color = LEVEL_COLOR[entry.level];
    const moduleTag = entry.module ? ` ${BOLD}[${entry.module}]${RESET_COLOR}` : "";
    const traceTag = entry.traceId ? ` ${LEVEL_COLOR.debug}<${entry.traceId.slice(0, 8)}>${RESET_COLOR}` : "";

    let line = `${LEVEL_COLOR.debug}${ts}${RESET_COLOR}${traceTag} ${color}${levelLabel}${RESET_COLOR}${moduleTag} ${entry.message}`;
    if (entry.meta && Object.keys(entry.meta).length > 0) {
      // Strip traceId from meta since it's already in the traceTag.
      const metaCopy: Record<string, unknown> = { ...entry.meta };
      if (entry.traceId) delete metaCopy.traceId;
      if (Object.keys(metaCopy).length > 0) {
        line += ` ${LEVEL_COLOR.debug}${safeStringify(metaCopy)}${RESET_COLOR}`;
      }
    }

    // fatal/error → stderr; everything else → stdout
    if (entry.level === "error" || entry.level === "fatal") {
      console.error(line);
    } else if (entry.level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Singleton + factory
// ────────────────────────────────────────────────────────────────────────────

/** Root singleton logger (no module scope). */
export const logger = new Logger();

/**
 * Create a module-scoped logger. Each call returns a NEW Logger instance with
 * the given module name — use it once per module and cache the reference.
 */
export function createLogger(moduleName: string): Logger {
  return new Logger(moduleName);
}

/**
 * Run a function with a trace ID bound to all log entries emitted inside (on
 * the root singleton logger). Convenience wrapper for `logger.withTrace()`.
 */
export function withTraceLog<T>(traceId: string, fn: () => T): T {
  return logger.withTrace(traceId, fn);
}
