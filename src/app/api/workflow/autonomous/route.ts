// POST /api/workflow/autonomous — Run a full autonomous workflow
// GET  /api/workflow/autonomous?eventId=xxx — (not implemented; workflows are async via this POST)
import { NextRequest, NextResponse } from "next/server";
import { runAutonomousWorkflow, runSingleTask, pairProgram } from "@/lib/workflow/autonomous-runner";
import type { AIProviderConfig } from "@/lib/agents/ai-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;  // 5 minutes max for Vercel

export async function POST(req: NextRequest) {
  const userId = await requireUserId(); if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const body = await req.json();
    const { mode } = body;

    // mode: "workflow" | "single" | "pair-program"
    if (mode === "single") {
      // Single task execution
      const { kind, input, timeoutMs } = body;
      if (!kind) {
        return NextResponse.json({ error: "Missing 'kind' for single task mode" }, { status: 400 });
      }
      const result = await runSingleTask(kind, input || {}, {
        provider: input?.provider as AIProviderConfig | undefined,
        timeoutMs,
      });
      return NextResponse.json({ mode: "single", result });
    }

    if (mode === "pair-program") {
      // AI Pair Programmer
      const { request, repositoryUrl, provider } = body;
      if (!request) {
        return NextResponse.json({ error: "Missing 'request' for pair-program mode" }, { status: 400 });
      }
      const result = await pairProgram(request, {
        repositoryUrl,
        provider: provider as AIProviderConfig | undefined,
      });
      return NextResponse.json({ mode: "pair-program", result });
    }

    // Default: full autonomous workflow
    const { goal, repositoryUrl, provider, autoCommit, timeoutMs } = body;
    if (!goal) {
      return NextResponse.json({ error: "Missing 'goal' for workflow mode" }, { status: 400 });
    }

    const result = await runAutonomousWorkflow({
      goal,
      repositoryUrl,
      provider: provider as AIProviderConfig | undefined,
      autoCommit,
      timeoutMs: timeoutMs ?? 10 * 60 * 1000,
    });

    return NextResponse.json({ mode: "workflow", result });
  } catch (err: any) {
    console.error("[/api/workflow/autonomous] error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
