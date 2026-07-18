// POST /api/agents/execute — Execute a single task with an agent
// GET  /api/agents/execute?taskId=xxx — Poll task status
import { NextRequest, NextResponse } from "next/server";
import { registerAllAgents, taskQueue, eventBus } from "@/lib/agents";
import type { TaskKind } from "@/lib/agents/types";
import type { AIProviderConfig } from "@/lib/agents/ai-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { kind, title, input, priority, timeoutMs, maxAttempts } = body;

    if (!kind || !title) {
      return NextResponse.json({ error: "Missing 'kind' or 'title'" }, { status: 400 });
    }

    registerAllAgents();

    // Validate provider config if provided
    let provider: AIProviderConfig | undefined;
    if (input?.provider) {
      provider = input.provider as AIProviderConfig;
      if (!provider.apiKey && provider.providerId !== "ollama" && provider.providerId !== "lmstudio") {
        return NextResponse.json({ error: "Provider apiKey required" }, { status: 400 });
      }
    }

    const task = taskQueue.enqueue({
      kind: kind as TaskKind,
      title,
      description: body.description ?? "",
      priority: priority ?? "medium",
      input: input ?? {},
      timeoutMs: timeoutMs ?? 120000,
      maxAttempts,
    });

    return NextResponse.json({
      taskId: task.id,
      status: task.status,
      kind: task.kind,
      title: task.title,
      message: "Task enqueued. Poll GET /api/agents/execute?taskId=... for status.",
    });
  } catch (err: any) {
    console.error("[/api/agents/execute] error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!taskId) {
    // List all tasks
    registerAllAgents();
    const tasks = taskQueue.getAll().map(t => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      status: t.status,
      progress: t.progress,
      progressMessage: t.progressMessage,
      assignedAgent: t.assignedAgent,
      error: t.error,
      createdAt: t.createdAt,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
      attempts: t.attempts,
      hasOutput: !!t.output,
    }));
    return NextResponse.json({ tasks, count: tasks.length });
  }

  registerAllAgents();
  const task = taskQueue.get(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: task.id,
    kind: task.kind,
    title: task.title,
    status: task.status,
    progress: task.progress,
    progressMessage: task.progressMessage,
    assignedAgent: task.assignedAgent,
    error: task.error,
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    durationMs: task.completedAt && task.startedAt ? task.completedAt - task.startedAt : null,
    output: task.output ?? null,
  });
}
