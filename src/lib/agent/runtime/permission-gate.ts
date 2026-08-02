// CodeInsight AI — Permission Gate (Layer 7)
// Controls tool execution permissions: allow / prompt / deny.
// For "prompt" tools, emits permission.requested event and waits for UI response.

import type {
  PermissionLevel,
  PermissionGate as IPermissionGate,
  AgentEvent,
  ToolManifest,
} from "../contracts";
import type { EventBusImpl } from "./event-bus";
import { makeEvent } from "./event-bus";

export class PermissionGateImpl implements IPermissionGate {
  private pendingRequests = new Map<string, (granted: boolean, reason?: string) => void>();

  constructor(private readonly eventBus: EventBusImpl) {}

  /** Check permission level for a tool (from manifest) */
  check(toolName: string, _params: unknown, manifest?: ToolManifest): PermissionLevel {
    if (!manifest) return "deny"; // unknown tool → deny
    return manifest.permission;
  }

  /**
   * Request permission for a tool execution.
   * If "allow" → resolves immediately.
   * If "prompt" → emits permission.requested event, waits for respond().
   * If "deny" → resolves false immediately.
   */
  async request(
    nodeId: string,
    toolName: string,
    params: unknown,
    manifest?: ToolManifest,
    diff?: string,
  ): Promise<boolean> {
    const level = this.check(toolName, params, manifest);

    if (level === "allow") return true;
    if (level === "deny") return false;

    // "prompt" — emit event and wait for response
    return new Promise<boolean>((resolve) => {
      this.pendingRequests.set(nodeId, (granted, reason) => {
        if (granted) {
          this.eventBus.emit(makeEvent({ type: "permission.granted", nodeId }));
        } else {
          this.eventBus.emit(makeEvent({ type: "permission.denied", nodeId, reason: reason || "Denied by user" }));
        }
        resolve(granted);
      });

      this.eventBus.emit(
        makeEvent({
          type: "permission.requested",
          nodeId,
          tool: toolName,
          params,
          diff,
        }),
      );
    });
  }

  /** Respond to a permission request (called by UI) */
  respond(nodeId: string, granted: boolean, reason?: string): void {
    const resolver = this.pendingRequests.get(nodeId);
    if (resolver) {
      this.pendingRequests.delete(nodeId);
      resolver(granted, reason);
    }
  }

  /** Check if a node is waiting for permission */
  isPending(nodeId: string): boolean {
    return this.pendingRequests.has(nodeId);
  }

  /** Cancel all pending requests (for task cancellation) */
  cancelAll(): void {
    for (const [nodeId, resolver] of this.pendingRequests) {
      resolver(false, "Task cancelled");
      this.pendingRequests.delete(nodeId);
    }
  }
}
