// CodeInsight AI — Agent-to-Agent Communication
import type { AgentId, AgentMessage } from "./types";
import { eventBus } from "./event-bus";

class MessageBus {
  private inbox = new Map<AgentId, AgentMessage[]>();

  send(from: AgentId, to: AgentId | "broadcast", type: AgentMessage["type"], payload: any): string {
    const msg: AgentMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      from,
      to,
      type,
      payload,
      timestamp: Date.now(),
    };
    eventBus.emit({ type: "agent:message", message: msg });
    if (to === "broadcast") {
      for (const [agentId] of this.inbox) {
        if (agentId !== from) {
          this.inbox.get(agentId)!.push(msg);
        }
      }
    } else {
      let box = this.inbox.get(to);
      if (!box) {
        box = [];
        this.inbox.set(to, box);
      }
      box.push(msg);
    }
    return msg.id;
  }

  receive(agent: AgentId): AgentMessage[] {
    const box = this.inbox.get(agent) ?? [];
    const msgs = [...box];
    box.length = 0;
    return msgs;
  }

  peek(agent: AgentId): AgentMessage[] {
    return [...(this.inbox.get(agent) ?? [])];
  }

  clear(agent: AgentId): void {
    this.inbox.delete(agent);
  }
}

export const messageBus = new MessageBus();
