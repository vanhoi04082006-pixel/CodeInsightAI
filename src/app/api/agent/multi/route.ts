// CodeInsight AI — Stage 6: Multi-Agent Endpoint
// POST /api/agent/multi — Run multiple specialized agents in parallel.
// SSE stream: events from all agents, tagged with agentId.

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { query, analysisId, agentIds, maxIterations = 1 } = body;
  if (!query || typeof query !== "string") return NextResponse.json({ error: "Missing 'query'" }, { status: 400 });
  if (!analysisId) return NextResponse.json({ error: "Missing 'analysisId'" }, { status: 400 });

  const analysis = await db.analysis.findFirst({ where: { id: analysisId, userId }, select: { id: true, report: true, userId: true } });
  if (!analysis) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });

  // Dynamic imports
  const { AGENT_PROFILES, generateSubQueries, DEFAULT_AGENTS } = await import("@/lib/agent/multi-agent/profiles");
  const selectedAgentIds: string[] = (agentIds && Array.isArray(agentIds) ? agentIds : DEFAULT_AGENTS).filter((id: string) => AGENT_PROFILES[id]);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        send({ type: "multi.started", query, agents: selectedAgentIds, timestamp: Date.now() } as any);

        // Build shared pipeline
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
        const contextBuilder = createContextBuilder();
        const planner = createPlanner(allCapabilities, toolInventory, contextBuilder);

        // Generate sub-queries
        const subQueries = generateSubQueries(query, selectedAgentIds);

        // Run all agents in parallel
        const agentResults: any[] = [];
        const agentPromises = selectedAgentIds.map(async (agentId: string) => {
          const profile = AGENT_PROFILES[agentId];
          const t0 = Date.now();
          send({ type: "agent.started", agentId, agentName: profile.name, icon: profile.icon, color: profile.color, timestamp: Date.now() } as any);

          try {
            const subQuery = subQueries[agentId] || profile.defaultQuery;
            const planResult = await planner.plan(subQuery, context);
            if (!planResult.ok) {
              send({ type: "agent.failed", agentId, error: planResult.error, timestamp: Date.now() } as any);
              return { agentId, status: "failed", summary: planResult.error.message, findings: "", durationMs: Date.now() - t0 };
            }

            const runtime = createRuntime(toolRegistry);
            const taskId = `multi-${agentId}-${Date.now()}`;
            let lastSummary = "";

            for await (const event of runtime.run(planResult.value, context, taskId)) {
              send({ ...event, agentId, agentName: profile.name, timestamp: Date.now() });
              const ev = event as any;
              if (ev.type === "task.completed") lastSummary = ev.summary || "";
              if (ev.type === "task.failed") lastSummary = ev.error?.message || "failed";
            }

            const durationMs = Date.now() - t0;
            send({ type: "agent.completed", agentId, agentName: profile.name, summary: lastSummary, durationMs, timestamp: Date.now() } as any);
            return { agentId, status: "completed", summary: lastSummary, findings: lastSummary, durationMs };
          } catch (e: any) {
            const durationMs = Date.now() - t0;
            send({ type: "agent.failed", agentId, error: { code: "AGENT_ERROR", message: e.message, recoverable: false }, timestamp: Date.now() } as any);
            return { agentId, status: "failed", summary: e.message, findings: "", durationMs };
          }
        });

        // Wait for all agents
        const results = await Promise.all(agentPromises);
        agentResults.push(...results);

        // Coordinator: summarize all agent results
        send({ type: "coordinator.started", timestamp: Date.now() } as any);

        const agentSummaries = results.map((r: any) => {
          const profile = AGENT_PROFILES[r.agentId];
          return `${profile.icon} ${profile.name}: ${r.summary}`;
        }).join("\n\n");

        let coordinatorSummary = "";
        try {
          const { getPlatformAIConfig } = await import("@/lib/platform-ai");
          const { callAI } = await import("@/lib/ai-client");
          const provider = await getPlatformAIConfig();
          if (provider) {
            const result = await callAI(
              { providerId: provider.providerId, apiKey: provider.apiKey, baseUrl: provider.baseUrl, model: provider.model, temperature: 0.3, maxTokens: 2000, timeout: 30 },
              [
                { role: "system", content: "You are a Coordinator Agent. Summarize findings from multiple specialized agents into a concise, actionable report. Organize by priority (critical first)." },
                { role: "user", content: `User request: ${query}\n\nAgent findings:\n${agentSummaries}\n\nProvide a consolidated summary with top 5 priorities.` },
              ],
              { maxTokens: 2000, temperature: 0.3, timeout: 30 },
            );
            coordinatorSummary = result.content;
          } else {
            coordinatorSummary = `No AI provider configured. Raw findings:\n\n${agentSummaries}`;
          }
        } catch {
          coordinatorSummary = `Summary generation failed. Raw findings:\n\n${agentSummaries}`;
        }

        send({ type: "coordinator.completed", summary: coordinatorSummary, agentCount: results.length, timestamp: Date.now() } as any);
        send({ type: "multi.completed", totalAgents: results.length, completed: results.filter((r: any) => r.status === "completed").length, failed: results.filter((r: any) => r.status === "failed").length, timestamp: Date.now() } as any);
      } catch (e) {
        send({ type: "task.failed", error: { code: "MULTI_AGENT_ERROR", message: e instanceof Error ? e.message : String(e), recoverable: false }, timestamp: Date.now() });
      }

      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
}
