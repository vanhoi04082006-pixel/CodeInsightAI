// CodeInsight AI — Agent Run API (Layer 9)
// POST /api/agent/run — Streams AgentEvent via SSE
//
// SINGLE EVENT CHANNEL: events flow only through the async generator
// from runtime.run(). The EventBus is used internally by the Runtime
// for logging/metrics but NOT for SSE streaming — preventing double-emit.

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

// Global registry for cross-route communication (permission signaling).
// Uses globalThis to share state between /api/agent/run and /api/agent/permission.
// In Vercel serverless, this works within the same serverless function instance.
// For multi-instance production, use Redis pub/sub or DB polling.
const globalAny = globalThis as any;
if (!globalAny.__agentActiveRuntimes) {
  globalAny.__agentActiveRuntimes = new Map();
}
const activeRuntimes: Map<string, { permissionGate: { respond: (nodeId: string, granted: boolean, reason?: string) => void } }> = globalAny.__agentActiveRuntimes;

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { query, analysisId, locale } = body;

  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "Missing 'query' field" }, { status: 400 });
  }

  if (!analysisId) {
    return NextResponse.json({ error: "Missing 'analysisId' field" }, { status: 400 });
  }

  // Verify ownership
  const analysis = await db.analysis.findFirst({
    where: { id: analysisId, userId },
    select: { id: true, report: true, userId: true },
  });

  if (!analysis) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const userLocale = locale === "vi" ? "vi" : "en";

  // SSE streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // ── Phase 1: Build agent pipeline ──
        send({ type: "node.started", nodeId: "setup", tool: "spm-builder", timestamp: Date.now() });

        const { buildSPM } = await import("@/lib/agent/spm/builder");
        const { buildIndexes } = await import("@/lib/agent/indexes/index-builder");
        const { createQueryService } = await import("@/lib/agent/query/query-service");
        const { createRegistries } = await import("@/lib/agent/tools");
        const { createSkillRegistry } = await import("@/lib/agent/skills");
        const { createPlanner } = await import("@/lib/agent/planner/planner");
        const { createRuntime } = await import("@/lib/agent/runtime/runtime");
        const { createAgentMemory } = await import("@/lib/agent/memory/agent-memory");

        const report = analysis.report as any;
        const spmResult = buildSPM(report, analysisId);
        if (!spmResult.ok) {
          send({ type: "task.failed", error: spmResult.error, timestamp: Date.now() });
          controller.close();
          return;
        }

        const spm = spmResult.value;
        const indexes = buildIndexes(spm);
        const queryService = createQueryService(spm, indexes);
        const { toolRegistry, capabilityRegistry } = createRegistries();
        const skillRegistry = createSkillRegistry();
        const memory = createAgentMemory();
        memory.initializeProject(spm, indexes);

        const context = {
          spm,
          query: queryService,
          memory,
          analysisId,
          locale: userLocale as "en" | "vi",
        };

        send({ type: "node.completed", nodeId: "setup", result: "SPM + indexes ready", timestamp: Date.now() });

        // ── Phase 2: Match skill ──
        const skill = skillRegistry.match(query);
        if (skill) {
          send({ type: "memory.updated", working: { currentStep: `Skill: ${skill.name}` }, timestamp: Date.now() });
        }

        // ── Phase 3: Generate plan via LLM Planner ──
        send({ type: "node.started", nodeId: "planner", tool: "planner", timestamp: Date.now() });

        // Get all valid capabilities from the capability registry
        const allCapabilities = (toolRegistry as any).listAllManifests?.()?.flatMap((m: any) => m.capabilities) || [];
        const planner = createPlanner(allCapabilities);
        const planResult = await planner.plan(query, context);

        if (!planResult.ok) {
          send({ type: "task.failed", error: planResult.error, timestamp: Date.now() });
          controller.close();
          return;
        }

        send({ type: "node.completed", nodeId: "planner", result: "Plan generated", timestamp: Date.now() });
        send({ type: "plan.generated", plan: planResult.value, timestamp: Date.now() });

        // ── Phase 4: Execute plan via Runtime ──
        // SINGLE EVENT CHANNEL: only iterate the async generator.
        // Do NOT subscribe to EventBus — events come through the generator only.
        const runtime = createRuntime(toolRegistry);
        const taskId = `task-${Date.now()}`;

        // Register runtime for permission signaling
        activeRuntimes.set(taskId, {
          permissionGate: runtime.permissionGate,
        });

        // Emit taskId to client (for permission responses)
        send({ type: "task.started", taskId, timestamp: Date.now() } as any);

        for await (const event of runtime.run(planResult.value, context)) {
          // Enrich events with taskId for permission correlation
          send({ ...event, taskId });
        }

        activeRuntimes.delete(taskId);
      } catch (e) {
        send({
          type: "task.failed",
          error: {
            code: "RUNTIME_ERROR",
            message: e instanceof Error ? e.message : String(e),
            recoverable: false,
          },
          timestamp: Date.now(),
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

// Export for type checking
export { activeRuntimes as _activeRuntimes };
