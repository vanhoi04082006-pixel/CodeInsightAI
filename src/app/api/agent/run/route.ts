// CodeInsight AI — Agent Run API (Layer 9)
// POST /api/agent/run — Streams AgentEvent via SSE

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { query, analysisId } = body;

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

  // SSE streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // Build agent pipeline
        send({ type: "node.started", nodeId: "setup", tool: "spm-builder", timestamp: Date.now() });

        const { buildSPM } = await import("@/lib/agent/spm/builder");
        const { buildIndexes } = await import("@/lib/agent/indexes/index-builder");
        const { createQueryService } = await import("@/lib/agent/query/query-service");
        const { createRegistries } = await import("@/lib/agent/tools");
        const { createSkillRegistry } = await import("@/lib/agent/skills");
        const { createPlanner } = await import("@/lib/agent/planner/planner");
        const { createRuntime } = await import("@/lib/agent/runtime/runtime");
        const { createAgentMemory } = await import("@/lib/agent/memory/agent-memory");
        const { defaultPolicy } = await import("@/lib/agent/planner/execution-policy");

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
          locale: "en" as const,
        };

        send({ type: "node.completed", nodeId: "setup", result: "SPM + indexes ready", timestamp: Date.now() });

        // Match skill
        const skill = skillRegistry.match(query);
        if (skill) {
          send({ type: "memory.updated", working: { currentStep: `Skill: ${skill.name}` }, timestamp: Date.now() });
        }

        // Generate plan via Planner
        // Use a simple inline plan for now (LLM planner requires API key)
        const { ExecutionGraphBuilder, createNode } = await import("@/lib/agent/planner/execution-graph");
        const builder = new ExecutionGraphBuilder();

        // Build a basic plan: search → find issues → AI insight
        builder.addNode(createNode("step-1", `Search code: ${query}`, "search-code", { query }, { parallelGroup: "discover" }));
        builder.addNode(createNode("step-2", "Find issues", "find-issues", {}, { parallelGroup: "discover" }));
        builder.addNode(createNode("step-3", "Get architecture", "find-architecture", {}, { dependsOn: ["step-1"] }));
        builder.addNode(createNode("step-4", "Get metrics", "find-metrics", {}, { dependsOn: ["step-1"] }));

        const graph = builder.build();
        const policy = defaultPolicy();
        const plan = { graph, policy, estimatedTokens: 2000, estimatedTimeMs: 30000 };

        send({ type: "plan.generated", plan, timestamp: Date.now() });

        // Execute plan
        const runtime = createRuntime(toolRegistry);
        const eventBus = runtime.eventBus;

        const unsub = eventBus.subscribe((event) => {
          send(event);
        });

        for await (const event of runtime.run(plan, context)) {
          send(event);
        }

        unsub();
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
