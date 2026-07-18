// CodeInsight AI — Event Persister (Prompt 13)
// Subscribes to the agent event bus and persists task lifecycle events to the
// Prisma `AgentTask` and `AgentEvent` tables.
//
// Best-effort: all DB writes are wrapped in try/catch — DB failures never
// crash the event bus or interfere with the running agents. Call
// `initEventPersister()` once at app boot to activate.

import { eventBus } from "./event-bus";
import { db } from "@/lib/db";

let initialized = false;

/**
 * Subscribe to the event bus and persist task lifecycle events to the
// AgentTask + AgentEvent Prisma tables. Idempotent — safe to call multiple times.
 */
export function initEventPersister(): void {
  if (initialized) return;
  initialized = true;

  // ── Task lifecycle → AgentTask table ────────────────────────────────────

  eventBus.on("task:created", async (evt) => {
    if (evt.type !== "task:created") return;
    try {
      await db.agentTask.create({
        data: {
          taskId: evt.task.id,
          kind: evt.task.kind,
          title: evt.task.title,
          status: evt.task.status,
          assignedAgent: evt.task.assignedAgent ?? null,
          priority: evt.task.priority,
          input: JSON.stringify(evt.task.input ?? {}),
          progress: evt.task.progress,
          attempts: evt.task.attempts,
          parentTaskId: evt.task.parentTaskId ?? null,
          createdAt: new Date(evt.task.createdAt),
          startedAt: evt.task.startedAt ? new Date(evt.task.startedAt) : null,
        },
      }).catch(() => {
        // Likely a duplicate taskId (e.g. event replay) — ignore.
      });
    } catch {
      // Swallow — never propagate DB errors back into the event bus.
    }
  });

  eventBus.on("task:started", async (evt) => {
    if (evt.type !== "task:started") return;
    try {
      await db.agentTask.update({
        where: { taskId: evt.task.id },
        data: {
          status: "running",
          startedAt: new Date(evt.task.startedAt ?? Date.now()),
          assignedAgent: evt.task.assignedAgent ?? null,
        },
      });
    } catch {
      // Task row may not exist yet (e.g. event arrived before task:created was
      // persisted) — ignore.
    }
  });

  eventBus.on("task:completed", async (evt) => {
    if (evt.type !== "task:completed") return;
    try {
      await db.agentTask.update({
        where: { taskId: evt.task.id },
        data: {
          status: "completed",
          progress: 100,
          output: JSON.stringify(evt.task.output ?? {}),
          completedAt: new Date(evt.task.completedAt ?? Date.now()),
        },
      });
    } catch {
      // Best-effort — ignore.
    }
  });

  eventBus.on("task:failed", async (evt) => {
    if (evt.type !== "task:failed") return;
    try {
      await db.agentTask.update({
        where: { taskId: evt.task.id },
        data: {
          status: "failed",
          error: evt.error,
          completedAt: new Date(evt.task.completedAt ?? Date.now()),
        },
      });
    } catch {
      // Best-effort — ignore.
    }
  });

  eventBus.on("task:cancelled", async (evt) => {
    if (evt.type !== "task:cancelled") return;
    try {
      await db.agentTask.update({
        where: { taskId: evt.taskId },
        data: {
          status: "cancelled",
          completedAt: new Date(),
        },
      });
    } catch {
      // Best-effort — ignore.
    }
  });

  eventBus.on("task:retrying", async (evt) => {
    if (evt.type !== "task:retrying") return;
    try {
      await db.agentTask.update({
        where: { taskId: evt.task.id },
        data: {
          status: "retrying",
          attempts: evt.attempt,
        },
      });
    } catch {
      // Best-effort — ignore.
    }
  });

  eventBus.on("task:progress", async (evt) => {
    if (evt.type !== "task:progress") return;
    try {
      await db.agentTask.update({
        where: { taskId: evt.taskId },
        data: { progress: evt.progress },
      });
    } catch {
      // Best-effort — ignore.
    }
  });

  // ── Agent events → AgentEvent table ─────────────────────────────────────

  eventBus.on("agent:event", async (evt) => {
    if (evt.type !== "agent:event") return;
    try {
      await db.agentEvent.create({
        data: {
          agentId: evt.event.agent,
          type: evt.event.type,
          message: evt.event.message,
          level: evt.event.level,
          data: evt.event.data ? JSON.stringify(evt.event.data) : null,
          createdAt: new Date(evt.event.timestamp),
        },
      });
    } catch {
      // Best-effort — ignore.
    }
  });

  // ── Plain log events → AgentEvent table (type="log") ────────────────────

  eventBus.on("log", async (evt) => {
    if (evt.type !== "log") return;
    try {
      await db.agentEvent.create({
        data: {
          agentId: evt.agent ?? null,
          type: "log",
          message: evt.message,
          level: evt.level,
          createdAt: new Date(),
        },
      });
    } catch {
      // Best-effort — ignore.
    }
  });
}

/** Returns true if the persister has been initialized. */
export function isEventPersisterInitialized(): boolean {
  return initialized;
}

/** Reset the initialized flag — primarily useful for tests. */
export function resetEventPersister(): void {
  initialized = false;
}
