// CodeInsight AI — Production: Graceful Shutdown (Prompt 15)
// Coordinates cleanup of all subsystems (DB connections, log buffers, cache
// flushes, in-flight tasks) when the process receives SIGTERM / SIGINT /
// beforeExit. Handlers run in reverse registration order, each with a 10s
// timeout. After all handlers complete (or time out), the process exits.

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ShutdownHandler {
  name: string;
  handler: () => Promise<void> | void;
  timeoutMs?: number;
}

export interface ShutdownResult {
  name: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

export type ShutdownCallback = (reason: string) => void | Promise<void>;

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_HANDLER_TIMEOUT_MS = 10_000;
const SHUTDOWN_EXIT_CODE = 0;

// ────────────────────────────────────────────────────────────────────────────
// ShutdownHandler (the class — named after the type above; we use a distinct
//                    class name to avoid collision).
// ────────────────────────────────────────────────────────────────────────────

class GracefulShutdownCoordinator {
  private handlers: ShutdownHandler[] = [];
  private callbacks: ShutdownCallback[] = [];
  private _isShuttingDown = false;
  private _shutdownReason: string | null = null;
  private signalListenersAttached = false;

  /** True once shutdown has begun. Read-only via the `isShuttingDown` getter. */
  get isShuttingDown(): boolean {
    return this._isShuttingDown;
  }

  /** The reason the shutdown was triggered (e.g. "SIGTERM"). */
  get shutdownReason(): string | null {
    return this._shutdownReason;
  }

  /**
   * Register a cleanup handler. Handlers are run in reverse registration
   * order during shutdown (LIFO — most recently registered first).
   */
  register(name: string, handler: () => Promise<void> | void, timeoutMs?: number): void {
    if (this._isShuttingDown) {
      console.warn(`[shutdown] Cannot register handler "${name}" — shutdown already in progress.`);
      return;
    }
    // Prevent duplicate registration by name.
    if (this.handlers.some((h) => h.name === name)) {
      console.warn(`[shutdown] Handler "${name}" already registered — replacing.`);
      this.handlers = this.handlers.filter((h) => h.name !== name);
    }
    this.handlers.push({ name, handler, timeoutMs });
  }

  /** Unregister a handler by name. */
  unregister(name: string): boolean {
    const before = this.handlers.length;
    this.handlers = this.handlers.filter((h) => h.name !== name);
    return this.handlers.length < before;
  }

  /**
   * Register a one-time callback fired AFTER all handlers have run, just
   * before the process exits. Useful for final flush / notify-upstream.
   */
  onShutdown(callback: ShutdownCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Run all registered shutdown handlers (in reverse order) and exit the
   * process. Each handler has its own timeout (default 10s); if it exceeds
   * the timeout it is abandoned and the next handler runs.
   *
   * This method NEVER returns normally — it always calls `process.exit()`.
   */
  async shutdown(reason: string = "manual"): Promise<void> {
    if (this._isShuttingDown) {
      // Already shutting down — make this idempotent.
      console.log(`[shutdown] Already in progress (reason: ${this._shutdownReason}). Ignoring "${reason}".`);
      return;
    }
    this._isShuttingDown = true;
    this._shutdownReason = reason;

    console.log(`\n[shutdown] Graceful shutdown started — reason: ${reason}`);
    const startedAt = Date.now();

    // Run handlers in reverse order (LIFO).
    const ordered = [...this.handlers].reverse();
    const results: ShutdownResult[] = [];

    for (const entry of ordered) {
      const handlerStart = Date.now();
      const timeout = entry.timeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS;
      try {
        await withTimeout(entry.handler, timeout);
        const durationMs = Date.now() - handlerStart;
        results.push({ name: entry.name, success: true, durationMs });
        console.log(`[shutdown] ✓ ${entry.name} (${durationMs}ms)`);
      } catch (err) {
        const durationMs = Date.now() - handlerStart;
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.push({ name: entry.name, success: false, durationMs, error: errorMsg });
        console.error(`[shutdown] ✗ ${entry.name} failed after ${durationMs}ms: ${errorMsg}`);
      }
    }

    // Run one-time callbacks.
    for (const cb of this.callbacks) {
      try {
        await cb(reason);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[shutdown] onShutdown callback failed: ${errorMsg}`);
      }
    }
    this.callbacks = [];

    const totalMs = Date.now() - startedAt;
    const successCount = results.filter((r) => r.success).length;
    console.log(
      `[shutdown] Complete — ${successCount}/${results.length} handlers succeeded in ${totalMs}ms.`,
    );

    // Force-exit. Use a small timeout to let stdout flush.
    setTimeout(() => {
      process.exit(SHUTDOWN_EXIT_CODE);
    }, 50);
  }

  /**
   * Wire up signal listeners (SIGTERM, SIGINT, beforeExit). Safe to call
   * multiple times — listeners are only attached once.
   */
  attachSignalListeners(): void {
    if (this.signalListenersAttached) return;
    this.signalListenersAttached = true;

    const trigger = (signal: string) => {
      void this.shutdown(signal);
    };

    // SIGTERM / SIGINT — graceful.
    process.on("SIGTERM", () => trigger("SIGTERM"));
    process.on("SIGINT", () => trigger("SIGINT"));

    // beforeExit — opportunity to clean up before the event loop empties
    // (e.g. Bun/Node test runner). NOT a hard exit — only fires when the loop
    // would naturally exit.
    process.on("beforeExit", (code) => {
      if (!this._isShuttingDown) {
        void this.shutdown(`beforeExit(code=${code})`);
      }
    });

    // uncaughtException / unhandledRejection — best-effort shutdown then exit.
    // We log and continue with the normal shutdown flow so all handlers run.
    process.on("uncaughtException", (err) => {
      console.error("[shutdown] uncaughtException:", err);
      void this.shutdown(`uncaughtException: ${err.message}`);
    });
    process.on("unhandledRejection", (reason) => {
      const msg = reason instanceof Error ? reason.message : String(reason);
      console.error("[shutdown] unhandledRejection:", reason);
      void this.shutdown(`unhandledRejection: ${msg}`);
    });
  }

  /** List currently-registered handlers (for debugging). */
  listHandlers(): Array<{ name: string; timeoutMs?: number }> {
    return this.handlers.map((h) => ({ name: h.name, timeoutMs: h.timeoutMs }));
  }
}

/** Run a (possibly async) fn with a hard timeout. Rejects on timeout. */
function withTimeout<T>(fn: () => Promise<T> | T, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Handler timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    Promise.resolve(fn())
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Singleton + init helper
// ────────────────────────────────────────────────────────────────────────────

export const shutdownHandler = new GracefulShutdownCoordinator();

/**
 * Initialize graceful shutdown — wires up signal listeners and registers
 * default cleanup handlers (cache flush, metrics flush). Call once at app boot
 * (e.g. in instrumentation.ts or the top-level layout).
 *
 * Idempotent.
 */
export function initGracefulShutdown(): void {
  shutdownHandler.attachSignalListeners();

  // Register default cleanup handlers (in registration order; they'll run LIFO).
  // These are intentionally best-effort — no-op if the subsystem isn't used.
  shutdownHandler.register("flush-logs", async () => {
    // Logger is a singleton — importing lazily to avoid circular deps.
    try {
      const { logger } = await import("./logger");
      // Just clear the buffer; the event bus already persisted via event-persister.
      logger.clear();
    } catch {
      // No-op.
    }
  });

  shutdownHandler.register("clear-caches", async () => {
    try {
      const { clearAllCaches } = await import("./cache");
      clearAllCaches();
    } catch {
      // No-op.
    }
  });

  shutdownHandler.register("clear-tracer", async () => {
    try {
      const { tracer } = await import("./tracing");
      tracer.clear();
    } catch {
      // No-op.
    }
  });

  shutdownHandler.register("disconnect-db", async () => {
    try {
      const { db } = await import("@/lib/db");
      await db.$disconnect();
    } catch {
      // No-op.
    }
  });
}
