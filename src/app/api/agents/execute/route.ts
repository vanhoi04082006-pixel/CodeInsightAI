import { requireUserId, verifyAnalysisOwnership } from "@/lib/auth";
// POST /api/agents/execute — Execute a single task with an agent
// GET  /api/agents/execute?taskId=xxx — Poll task status
import { NextRequest, NextResponse } from "next/server";
import { registerAllAgents, taskQueue, eventBus } from "@/lib/agents";
import type { TaskKind } from "@/lib/agents/types";
import type { AIProviderConfig } from "@/lib/agents/ai-client";
import { checkTokenBudget, getUserPlanInfo } from "@/lib/billing/token-budget";
import {
  enforceRateLimit,
  rateLimit429Body,
  rateLimitHeaders,
  retryAfterSeconds,
  maybeCleanupOldBuckets,
} from "@/lib/rate-limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await requireUserId(); if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const body = await req.json();
    const { kind, title, input, priority, timeoutMs, maxAttempts } = body;

    if (!kind || !title) {
      return NextResponse.json({ error: "Missing 'kind' or 'title'" }, { status: 400 });
    }

    // P3.1: pre-flight token-budget check. Agent tasks fan out into multiple
    // callAI() invocations, so we block the enqueue if the user is already
    // over their monthly limit. (Per-call enforcement inside the agent loop
    // is deferred — the agent wrapper would need to forward userId+plan.)
    const planInfo = await getUserPlanInfo(userId);

    // P3.3: per-user hourly rate limit on agent task enqueues (DB-backed).
    // Agent tasks are the most expensive endpoint (fan-out into multiple AI
    // calls), so the limits are the tightest: Free 5/h, Pro 50/h, Team 200/h,
    // Enterprise unlimited. Check happens BEFORE the token-budget check
    // (cheaper — single indexed findUnique) and BEFORE the task is enqueued.
    const rl = await enforceRateLimit(userId, planInfo.plan, "agent");
    if (rl.blocked) {
      return NextResponse.json(rateLimit429Body(rl.status!, "agent"), {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds(rl.status)),
          ...rateLimitHeaders(rl.status),
        },
      });
    }
    maybeCleanupOldBuckets();

    const budget = await checkTokenBudget(userId, planInfo.plan);
    if (!budget.allowed && budget.status) {
      return NextResponse.json({
        error: "Token budget exceeded",
        message: `You've used ${budget.status.used.toLocaleString()} / ${budget.status.limit === -1 ? "∞" : budget.status.limit.toLocaleString()} tokens this month. Upgrade your plan for more tokens.`,
        status: "blocked",
        budget: {
          used: budget.status.used,
          limit: budget.status.limit,
          remaining: budget.status.remaining,
          exceeded: true,
          unlimited: budget.status.unlimited,
          resetsAt: budget.status.resetsAt.toISOString(),
        },
        upgradeUrl: "/?view=settings",
      }, { status: 429 });
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

    // P3.7 (multi-tenant isolation): when input.analysisId is provided, the
    // task will read or write against that analysis (e.g. agents that query
    // the report, codegraph, file summaries). Verify the calling user owns
    // the analysis BEFORE enqueuing — otherwise user A could enqueue an
    // agent that reads user B's analysis data via input.analysisId.
    //
    // Returns 404 (not 403) to avoid leaking that the resource exists.
    // Note: this gates the *enqueue* path. The agent itself doesn't re-check
    // — that's fine because the only way to reach the agent is via this
    // endpoint, which we've now gated.
    if (input?.analysisId && typeof input.analysisId === "string") {
      const owned = await verifyAnalysisOwnership(input.analysisId, userId, {
        select: { id: true, userId: true },
      });
      if (!owned) {
        return NextResponse.json(
          { error: "Analysis not found" },
          { status: 404 },
        );
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
