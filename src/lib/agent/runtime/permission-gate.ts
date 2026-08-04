// CodeInsight AI — Permission Gate (Layer 7)
// Controls tool execution permissions: allow / prompt / deny.
// For "prompt" tools, the ExecutionEngine yields permission.requested via the
// async generator, then calls permissionGate.request() which awaits the UI
// response (via respond()) OR a timeout — preventing infinite hangs.
//
// v2.0: The gate NO LONGER emits permission.* events via eventBus. The
// ExecutionEngine owns event emission (yielded through the single SSE channel).
// The gate's only job is to resolve a Promise when respond() is called or
// when the timeout elapses.

import type {
  PermissionLevel,
  PermissionGate as IPermissionGate,
  ToolManifest,
} from "../contracts";
import type { EventBusImpl } from "./event-bus";

/** Default timeout for permission requests (ms). Prevents infinite hang. */
const DEFAULT_PERMISSION_TIMEOUT_MS = 60_000;

export class PermissionGateImpl implements IPermissionGate {
  private pendingRequests = new Map<
    string,
    { resolve: (granted: boolean, reason?: string) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private timeoutMs: number = DEFAULT_PERMISSION_TIMEOUT_MS;

  constructor(private readonly eventBus: EventBusImpl) {}

  /** Set the permission request timeout (ms). */
  setTimeoutMs(ms: number): void {
    this.timeoutMs = ms > 0 ? ms : DEFAULT_PERMISSION_TIMEOUT_MS;
  }

  /** Check permission level for a tool (from manifest) */
  check(toolName: string, _params: unknown, manifest?: ToolManifest): PermissionLevel {
    if (!manifest) return "deny"; // unknown tool → deny
    return manifest.permission;
  }

  /**
   * Request permission for a tool execution.
   * If "allow" → resolves true immediately.
   * If "prompt" → awaits respond() OR timeout. On timeout, resolves false
   *   (auto-deny) so the runtime can continue instead of hanging forever.
   * If "deny" → resolves false immediately.
   *
   * NOTE: This method does NOT emit permission.* events. The ExecutionEngine
   * yields permission.requested before calling this, and permission.granted/
   * denied after this resolves.
   */
  async request(
    nodeId: string,
    _toolName: string,
    _params: unknown,
    manifest?: ToolManifest,
    _diff?: string,
  ): Promise<boolean> {
    const level = this.check(_toolName, _params, manifest);

    if (level === "allow") return true;
    if (level === "deny") return false;

    // "prompt" — wait for respond() or timeout
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        // Auto-deny on timeout — prevents infinite hang.
        this.pendingRequests.delete(nodeId);
        resolve(false);
      }, this.timeoutMs);

      this.pendingRequests.set(nodeId, {
        resolve: (granted, _reason) => {
          resolve(granted);
        },
        timer,
      });
    });
  }

  /** Respond to a permission request (called by UI via /api/agent/permission) */
  respond(nodeId: string, granted: boolean, reason?: string): void {
    const entry = this.pendingRequests.get(nodeId);
    if (entry) {
      clearTimeout(entry.timer);
      this.pendingRequests.delete(nodeId);
      entry.resolve(granted, reason);
    }
  }

  /** Check if a node is waiting for permission */
  isPending(nodeId: string): boolean {
    return this.pendingRequests.has(nodeId);
  }

  /** List all node IDs currently awaiting permission (for debugging/UI) */
  pendingNodeIds(): string[] {
    return [...this.pendingRequests.keys()];
  }

  /** Cancel all pending requests (for task cancellation) — resolves all as denied */
  cancelAll(): void {
    for (const [, entry] of this.pendingRequests) {
      clearTimeout(entry.timer);
      entry.resolve(false, "Task cancelled");
    }
    this.pendingRequests.clear();
  }
}
