// CodeInsight AI — Event Bus for Multi-Agent System
import type { EventBusEvent } from "./types";

type Handler = (event: EventBusEvent) => void;

class EventBus {
  private handlers = new Map<string, Set<Handler>>();
  private wildcardHandlers = new Set<Handler>();
  private replayBuffer: EventBusEvent[] = [];
  private readonly maxBuffer = 500;

  on(eventType: string, handler: Handler): () => void {
    if (eventType === "*") {
      this.wildcardHandlers.add(handler);
      return () => this.wildcardHandlers.delete(handler);
    }
    let set = this.handlers.get(eventType);
    if (!set) {
      set = new Set();
      this.handlers.set(eventType, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit(event: EventBusEvent): void {
    this.replayBuffer.push(event);
    if (this.replayBuffer.length > this.maxBuffer) {
      this.replayBuffer.shift();
    }
    const type = event.type;
    const specific = this.handlers.get(type);
    if (specific) specific.forEach(h => safeCall(h, event));
    this.wildcardHandlers.forEach(h => safeCall(h, event));
  }

  replay(eventType: string, handler: Handler): void {
    for (const e of this.replayBuffer) {
      if (eventType === "*" || e.type === eventType) {
        safeCall(handler, e);
      }
    }
  }

  clearBuffer(): void {
    this.replayBuffer = [];
  }

  getBuffer(): EventBusEvent[] {
    return [...this.replayBuffer];
  }
}

function safeCall(handler: Handler, event: EventBusEvent): void {
  try {
    handler(event);
  } catch (err) {
    console.error("[event-bus] handler error:", err);
  }
}

export const eventBus = new EventBus();
