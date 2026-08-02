// CodeInsight AI — Event Bus (Layer 7)
// Pub/sub event system for Runtime ↔ UI communication.
// UI subscribes to events; Runtime emits events during execution.

import type { AgentEvent, EventBus as IEventBus } from "../contracts";

export class EventBusImpl implements IEventBus {
  private handlers = new Set<(event: AgentEvent) => void>();
  private typedHandlers = new Map<string, Set<(event: AgentEvent) => void>>();

  emit(event: AgentEvent): void {
    // Notify all-subscribers
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (e) {
        console.error("[EventBus] Handler error:", e);
      }
    }

    // Notify type-specific subscribers
    const typed = this.typedHandlers.get(event.type);
    if (typed) {
      for (const handler of typed) {
        try {
          handler(event);
        } catch (e) {
          console.error("[EventBus] Typed handler error:", e);
        }
      }
    }
  }

  subscribe(handler: (event: AgentEvent) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  subscribeType<T extends AgentEvent["type"]>(
    type: T,
    handler: (event: Extract<AgentEvent, { type: T }>) => void,
  ): () => void {
    const set = this.typedHandlers.get(type) ?? new Set();
    set.add(handler as (event: AgentEvent) => void);
    this.typedHandlers.set(type, set);
    return () => {
      set.delete(handler as (event: AgentEvent) => void);
      if (set.size === 0) {
        this.typedHandlers.delete(type);
      }
    };
  }

  /** Clear all handlers (for testing) */
  clear(): void {
    this.handlers.clear();
    this.typedHandlers.clear();
  }

  /** Count active subscribers */
  subscriberCount(): number {
    return this.handlers.size;
  }
}

/** Create a new EventBus instance */
export function createEventBus(): EventBusImpl {
  return new EventBusImpl();
}

/** Helper to create an event with timestamp */
export function makeEvent<T extends Omit<AgentEvent, "timestamp">>(
  event: T,
): AgentEvent {
  return { ...event, timestamp: Date.now() } as unknown as AgentEvent;
}
