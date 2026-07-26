// POST /api/agents/execute — Execute a single task with an agent (DIRECT call)
//
// Refactored: agents are called DIRECTLY — no direct-call task queue, no
// scheduler, no event bus, no registry. The agent runs synchronously inside
// this request and the result is returned inline. No polling endpoint.
//
// Request shape: { kind, title, input, description? }
// Response: { success, result, summary }
//
// Rate limit + token budget + analysis-ownership checks are preserved — they
// gate the most expensive endpoint (agent tasks fan out into multiple AI
// calls) and are multi-tenant safe.

import { requireUserId, verifyAnalysisOwnership } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import type { AIProviderConfig } from "@/lib/agents/ai-client";
import { checkTokenBudget, getUserPlanInfo } from "@/lib/billing/token-budget";
import {
  enforceRateLimit,
  rateLimit429Body,
  rateLimitHeaders,
  retryAfterSeconds,
  maybeCleanupOldBuckets,
} from "@/lib/rate-limiter";

// Agents are imported as singletons (they are stateless — no per-call state).
import type { BaseAgent } from "@/lib/agents/base-agent";
import type { Task, TaskKind } from "@/lib/agents/types";
import { bugFixerAgent } from "@/lib/agents/bug-fixer";
import { testAgent } from "@/lib/agents/test-agent";
import { refactoringAgent } from "@/lib/agents/refactoring-agent";
import { securityAgent } from "@/lib/agents/security-agent";
import { performanceAgent } from "@/lib/agents/performance-agent";
import { documentationAgent } from "@/lib/agents/documentation-agent";
import { codeReviewerAgent } from "@/lib/agents/code-reviewer";
import { repositoryAnalystAgent } from "@/lib/agents/repository-analyst";
import { devopsAgent } from "@/lib/agents/devops-agent";

// Map each supported task kind to its agent singleton. Kinds not in this map
// return 400. (direct-call's "plan" + "custom" + "generate-pr" kinds are
// no longer supported — the orchestrator/planner were deleted, and
// PRGenerator is a helper class, not a BaseAgent.)
const AGENT_MAP: Record<TaskKind, BaseAgent> = {
  "fix-bug": bugFixerAgent,
  "test": testAgent,
  "refactor": refactoringAgent,
  "security-audit": securityAgent,
  "perf-audit": performanceAgent,
  "document": documentationAgent,
  "review": codeReviewerAgent,
  "analyze": repositoryAnalystAgent,
  "devops": devopsAgent,
  // Kinds that have no direct agent mapping — they will hit the
  // `!agentFactory` 400 path below. They're kept here so the Record type is
  // exhaustive over TaskKind.
  "generate-pr": undefined as unknown as BaseAgent,
  "custom": undefined as unknown as BaseAgent,
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55; // Vercel Hobby limit is 60s — leave 5s headroom.

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { kind, title, input } = body;

    if (!kind || !title) {
      return NextResponse.json({ error: "Missing 'kind' or 'title'" }, { status: 400 });
    }

    // ── Pre-flight: per-user hourly rate limit (DB-backed) ──
    // Agent tasks are the most expensive endpoint (fan-out into multiple AI
    // calls), so the limits are the tightest: Free 5/h, Pro 50/h, Team 200/h,
    // Enterprise unlimited.
    const planInfo = await getUserPlanInfo(userId);
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

    // ── Pre-flight: monthly token budget ──
    // Block the call if the user is already over their monthly token limit.
    // Per-call enforcement happens inside callAI() (via checkTokenBudget).
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

    // ── Multi-tenant isolation: ownership-check the analysisId ──
    // When input.analysisId is provided, the task will read or write against
    // that analysis (e.g. agents that query the report, codegraph, file
    // summaries). Verify the calling user owns the analysis BEFORE invoking
    // the agent — otherwise user A could trigger an agent that reads user B's
    // analysis data via input.analysisId.
    //
    // Returns 404 (not 403) to avoid leaking that the resource exists.
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

    // ── Validate provider config if provided ──
    if (input?.provider) {
      const provider = input.provider as AIProviderConfig;
      if (!provider.apiKey && provider.providerId !== "ollama" && provider.providerId !== "lmstudio") {
        return NextResponse.json({ error: "Provider apiKey required" }, { status: 400 });
      }
    }

    // ── Resolve agent ──
    const agent = AGENT_MAP[kind as TaskKind];
    if (!agent) {
      return NextResponse.json(
        { error: `Unknown or unsupported agent kind: "${kind}"` },
        { status: 400 },
      );
    }

    // ── Build the Task object ──
    const task: Task = {
      id: crypto.randomUUID(),
      kind: kind as TaskKind,
      title,
      description: body.description ?? "",
      priority: body.priority ?? "medium",
      status: "running",
      input: input ?? {},
      createdAt: new Date().toISOString(),
    };

    // ── Run the agent DIRECTLY (no queue, no scheduler, no event bus) ──
    // 55s timeout — leaves headroom under Vercel's 60s Hobby limit for the
    // agent's AI round-trip + any post-processing.
    const signal = AbortSignal.timeout(55000);

    const result = await agent.run(task, signal, (p, msg) => {
      // Progress is logged server-side. Could be emitted via SSE in a future
      // enhancement, but for now the POST blocks until completion and the
      // frontend shows a spinner.
      console.log(`[/api/agents/execute] [${kind}] ${p}%: ${msg}`);
    });

    return NextResponse.json({
      success: result.success,
      result,
      summary: result.summary,
    });
  } catch (err: any) {
    console.error("[/api/agents/execute] error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
