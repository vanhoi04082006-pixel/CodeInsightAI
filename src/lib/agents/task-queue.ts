// CodeInsight AI — Task Queue with priority, retry, timeout, cancellation.
import type { Task, TaskPriority, TaskResult, RetryPolicy } from "./types";
import { DEFAULT_RETRY_POLICY } from "./types";
import { eventBus } from "./event-bus";

type TaskHandler = (task: Task, signal: AbortSignal, onProgress?: (p: number, msg: string) => void) => Promise<TaskResult>;

class TaskQueue {
  private pending: Task[] = [];
  private running = new Map<string, { task: Task; controller: AbortController; handler: TaskHandler }>();
  private handlers = new Map<string, TaskHandler>();
  private maxConcurrent: number;
  private policies = new Map<string, RetryPolicy>();
  private taskMap = new Map<string, Task>();

  constructor(maxConcurrent = 4) {
    this.maxConcurrent = maxConcurrent;
  }

  registerHandler(kind: string, handler: TaskHandler, policy?: RetryPolicy): void {
    this.handlers.set(kind, handler);
    if (policy) this.policies.set(kind, policy);
  }

  enqueue(task: Partial<Task> & { kind: Task["kind"]; title: string }): Task {
    const { kind, title, description, priority, dependencies, input, maxAttempts, timeoutMs, ...rest } = task;
    const full: Task = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      kind,
      title,
      description: description ?? "",
      priority: priority ?? "medium",
      status: "pending",
      dependencies: dependencies ?? [],
      input: input ?? {},
      createdAt: Date.now(),
      attempts: 0,
      maxAttempts: maxAttempts ?? this.policies.get(kind)?.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts,
      timeoutMs: timeoutMs ?? 60000,
      progress: 0,
      subtaskIds: [],
      ...rest,
    } as Task;

    this.taskMap.set(full.id, full);
    this.pending.push(full);
    this.sortPending();
    eventBus.emit({ type: "task:created", task: full });
    this.tryDispatch();
    return full;
  }

  cancel(taskId: string): void {
    const pendingIdx = this.pending.findIndex(t => t.id === taskId);
    if (pendingIdx >= 0) {
      const t = this.pending.splice(pendingIdx, 1)[0];
      t.status = "cancelled";
      t.completedAt = Date.now();
      eventBus.emit({ type: "task:cancelled", taskId });
      return;
    }
    const entry = this.running.get(taskId);
    if (entry) {
      entry.controller.abort();
      entry.task.status = "cancelled";
      entry.task.completedAt = Date.now();
      eventBus.emit({ type: "task:cancelled", taskId });
    }
  }

  get(taskId: string): Task | undefined {
    return this.taskMap.get(taskId);
  }

  getAll(): Task[] {
    return [...this.pending, ...Array.from(this.running.values()).map(e => e.task)];
  }

  getByStatus(status: Task["status"]): Task[] {
    return this.getAll().filter(t => t.status === status);
  }

  updateProgress(taskId: string, progress: number, message: string): void {
    const task = this.taskMap.get(taskId);
    if (!task) return;
    task.progress = Math.max(0, Math.min(100, progress));
    task.progressMessage = message;
    eventBus.emit({ type: "task:progress", taskId, progress: task.progress, message });
  }

  private sortPending(): void {
    const priorityOrder: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    this.pending.sort((a, b) => {
      const aDeps = a.dependencies.every(d => {
        const dep = this.taskMap.get(d);
        return dep && dep.status === "completed";
      });
      const bDeps = b.dependencies.every(d => {
        const dep = this.taskMap.get(d);
        return dep && dep.status === "completed";
      });
      if (aDeps && !bDeps) return -1;
      if (!aDeps && bDeps) return 1;
      const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pd !== 0) return pd;
      return a.createdAt - b.createdAt;
    });
  }

  private tryDispatch(): void {
    while (this.running.size < this.maxConcurrent && this.pending.length > 0) {
      const idx = this.pending.findIndex(t =>
        t.dependencies.every(d => {
          const dep = this.taskMap.get(d);
          return dep && dep.status === "completed";
        })
      );
      if (idx < 0) break;
      const task = this.pending.splice(idx, 1)[0];
      this.execute(task);
    }
  }

  private async execute(task: Task): Promise<void> {
    const handler = this.handlers.get(task.kind);
    if (!handler) {
      task.status = "failed";
      task.error = `No handler registered for kind "${task.kind}"`;
      task.completedAt = Date.now();
      eventBus.emit({ type: "task:failed", task, error: task.error });
      this.tryDispatch();
      return;
    }

    const controller = new AbortController();
    const policy = this.policies.get(task.kind) ?? DEFAULT_RETRY_POLICY;
    task.attempts++;

    this.running.set(task.id, { task, controller, handler });
    task.status = "running";
    task.startedAt = Date.now();
    eventBus.emit({ type: "task:started", task });

    const onProgress = (p: number, msg: string) => this.updateProgress(task.id, p, msg);

    try {
      const timeoutId = setTimeout(() => controller.abort(), task.timeoutMs);
      const result = await handler(task, controller.signal, onProgress);
      clearTimeout(timeoutId);

      task.output = result;
      task.progress = 100;
      task.status = result.success ? "completed" : "failed";
      task.completedAt = Date.now();
      this.running.delete(task.id);
      if (result.success) {
        eventBus.emit({ type: "task:completed", task });
      } else {
        await this.maybeRetry(task, handler, onProgress);
      }
    } catch (err: any) {
      this.running.delete(task.id);
      task.error = err?.message ?? String(err);
      if (controller.signal.aborted) {
        task.status = "cancelled";
        eventBus.emit({ type: "task:cancelled", taskId: task.id });
      } else {
        await this.maybeRetry(task, handler, onProgress);
      }
    }

    this.tryDispatch();
  }

  private async maybeRetry(
    task: Task,
    handler: TaskHandler,
    onProgress: (p: number, msg: string) => void
  ): Promise<void> {
    const policy = this.policies.get(task.kind) ?? DEFAULT_RETRY_POLICY;
    const controller = new AbortController();

    while (task.attempts < task.maxAttempts && !controller.signal.aborted) {
      task.attempts++;
      task.status = "retrying";
      const backoff = Math.min(
        policy.backoffMs * Math.pow(policy.backoffMultiplier, task.attempts - 1),
        policy.maxBackoffMs
      );
      eventBus.emit({ type: "task:retrying", task, attempt: task.attempts });
      eventBus.emit({
        type: "log",
        level: "warn",
        message: `Task ${task.id} retrying (attempt ${task.attempts}/${task.maxAttempts}) after ${backoff}ms`,
        agent: task.assignedAgent,
      });
      await sleep(backoff);

      try {
        const result = await handler(task, controller.signal, onProgress);
        task.output = result;
        if (result.success) {
          task.status = "completed";
          task.progress = 100;
          task.completedAt = Date.now();
          eventBus.emit({ type: "task:completed", task });
          return;
        }
      } catch (err: any) {
        task.error = err?.message ?? String(err);
        if (controller.signal.aborted) {
          task.status = "cancelled";
          eventBus.emit({ type: "task:cancelled", taskId: task.id });
          return;
        }
      }
    }

    task.status = "failed";
    task.completedAt = Date.now();
    eventBus.emit({ type: "task:failed", task, error: task.error ?? "Max retries exceeded" });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export const taskQueue = new TaskQueue(4);
