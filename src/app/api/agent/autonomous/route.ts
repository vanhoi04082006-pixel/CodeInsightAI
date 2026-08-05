// CodeInsight AI — Stage 5.3: Autonomous Coding Loop
// POST /api/agent/autonomous — Re-plan loop that automatically fixes
// lint/test errors by generating new plans with error context.

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { query, analysisId, maxIterations = 3 } = body;
  if (!query || typeof query !== "string") return NextResponse.json({ error: "Missing 'query'" }, { status: 400 });
  if (!analysisId) return NextResponse.json({ error: "Missing 'analysisId'" }, { status: 400 });

  const analysis = await db.analysis.findFirst({ where: { id: analysisId, userId }, select: { id: true, report: true, userId: true } });
  if (!analysis) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        send({ type: "autonomous.started", query, maxIterations, timestamp: Date.now() } as any);
        const { buildSPM } = await import("@/lib/agent/spm/builder");
        const { buildIndexes } = await import("@/lib/agent/indexes/index-builder");
        const { createQueryService } = await import("@/lib/agent/query/query-service");
        const { createRegistries } = await import("@/lib/agent/tools");
        const { createPlanner } = await import("@/lib/agent/planner/planner");
        const { createRuntime } = await import("@/lib/agent/runtime/runtime");
        const { createAgentMemory } = await import("@/lib/agent/memory/agent-memory");
        const { createContextBuilder } = await import("@/lib/agent/context");
        const report = analysis.report as any;
        const spmResult = buildSPM(report, analysisId);
        if (!spmResult.ok) { send({ type: "task.failed", error: spmResult.error, timestamp: Date.now() }); controller.close(); return; }
        const spm = spmResult.value;
        const indexes = buildIndexes(spm);
        const queryService = createQueryService(spm, indexes);
        const { toolRegistry } = createRegistries();
        const memory = createAgentMemory();
        memory.initializeProject(spm, indexes);
        memory.session.updatePreferences({ autoApproveWriteTools: true });
        memory.setUserId(userId);
        await memory.load();
        const context = { spm, query: queryService, memory, analysisId, locale: "en" as "en" | "vi" };
        const manifests = (toolRegistry as any).listAllManifests?.() || [];
        const allCapabilities = manifests.flatMap((m: any) => m.capabilities);
        const toolInventory = manifests.map((m: any) => ({ name: m.name, capabilities: m.capabilities, cost: m.cost, permission: m.permission }));
        const planner = createPlanner(allCapabilities, toolInventory, createContextBuilder());

        let currentQuery = query;
        let iteration = 0;
        let success = false;

        for (iteration = 0; iteration < maxIterations; iteration++) {
          send({ type: "autonomous.iteration", iteration: iteration + 1, max: maxIterations, query: currentQuery.slice(0, 200), timestamp: Date.now() } as any);
          const planResult = await planner.plan(currentQuery, context);
          if (!planResult.ok) { send({ type: "task.failed", error: planResult.error, timestamp: Date.now() }); break; }
          const runtime = createRuntime(toolRegistry);
          const taskId = `auto-${Date.now()}-${iteration}`;
          let lintResult: any = null;
          let testResult: any = null;
          let taskFailed = false;
          for await (const event of runtime.run(planResult.value, context, taskId)) {
            send({ ...event, taskId, iteration: iteration + 1 });
            const ev = event as any;
            if (ev.type === "node.completed") {
              if (ev.result?.errorCount !== undefined) lintResult = ev.result;
              if (ev.result?.failed !== undefined) testResult = ev.result;
            }
            if (ev.type === "task.failed") taskFailed = true;
          }
          const lintPassed = !lintResult || lintResult.errorCount === 0;
          const testPassed = !testResult || testResult.failed === 0;
          if (lintPassed && testPassed && !taskFailed) {
            success = true;
            send({ type: "autonomous.completed", iterations: iteration + 1, message: "All checks passed — code is ready for commit.", timestamp: Date.now() } as any);
            send({ type: "autonomous.suggest", action: "git-commit", message: "Code verified. Use git-commit tool to commit changes.", timestamp: Date.now() } as any);
            break;
          }
          const errors: string[] = [];
          if (!lintPassed) errors.push(`Lint errors (${lintResult.errorCount} errors):\n${(lintResult.output || "").slice(0, 1500)}`);
          if (!testPassed) errors.push(`Test failures (${testResult.failed}/${testResult.total} failed):\n${(testResult.output || "").slice(0, 1500)}`);
          currentQuery = `Fix the following errors from the previous attempt:\n\n${errors.join("\n\n")}\n\nOriginal task: ${query}`;
          send({ type: "autonomous.replan", iteration: iteration + 1, reason: `Lint: ${lintPassed ? "pass" : "fail"}, Tests: ${testPassed ? "pass" : "fail"}`, timestamp: Date.now() } as any);
        }
        if (!success) {
          send({ type: "autonomous.exhausted", iterations: maxIterations, message: `Reached max iterations (${maxIterations}). Manual intervention needed.`, timestamp: Date.now() } as any);
          send({ type: "task.failed", error: { code: "AUTONOMOUS_EXHAUSTED", message: `Failed after ${maxIterations} iterations.`, recoverable: false }, timestamp: Date.now() });
        }
      } catch (e) {
        send({ type: "task.failed", error: { code: "RUNTIME_ERROR", message: e instanceof Error ? e.message : String(e), recoverable: false }, timestamp: Date.now() });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
}
