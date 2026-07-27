// GET /api/codegraph/[analysisId]/ai-insight
//
// Lazy-loaded AI insight card for the CodeGraph tab.
//
// Loads the persisted CodeGraphSnapshot (or rebuilds from parsedData),
// computes graph statistics (central nodes, fragile modules, cascade risk),
// sends the stats to the AI with a prompt asking for:
//   - top 3 central nodes (bottlenecks)
//   - top 3 fragile modules (high fan-in × fan-out)
//   - refactor sequence suggestion
//   - overall assessment
//
// Returns structured JSON. The frontend renders an "AI Graph Analysis" card.
//
// Why lazy-loaded? A new AI pass would cost tokens on every analysis. Instead
// this endpoint is only called when the user clicks "🤖 AI Graph Analysis" —
// saving tokens for users who don't need the insight.
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildCodeGraph } from "@/lib/codegraph/builder";
import { callAIWithFallback, getFallbackChain } from "@/lib/ai-fallback";
import { getPlatformAIConfig } from "@/lib/platform-ai";
import { type AIMessage, type AICallResult } from "@/lib/ai-client";
import { getUserPlanInfo } from "@/lib/billing/token-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55; // Under the 60s Hobby limit

interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  avgConnectivity: number;
  circularDeps: number;
  centralNodes: Array<{
    id: string;
    label: string;
    filePath: string;
    type: string;
    connectivity: number;
    fanIn: number;
    fanOut: number;
  }>;
  fragileModules: Array<{
    id: string;
    label: string;
    filePath: string;
    fanIn: number;
    fanOut: number;
    fragility: number;
  }>;
  cascadeRisk: Array<{
    id: string;
    label: string;
    filePath: string;
    impactedCount: number;
  }>;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { analysisId } = await params;

  // Ownership check
  const analysis = await db.analysis.findUnique({
    where: { id: analysisId },
    select: { userId: true, parsedData: true },
  });
  if (!analysis || analysis.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Load graph — prefer persisted snapshot, fall back to rebuild from parsedData
  let graph: any = null;
  try {
    const snapshot = await db.codeGraphSnapshot.findUnique({
      where: { analysisId },
    });
    if (snapshot) {
      graph = JSON.parse(snapshot.graph);
    }
  } catch {
    /* fall back to rebuild */
  }

  if (!graph && analysis.parsedData) {
    try {
      const parsed = JSON.parse(analysis.parsedData);
      if (parsed?.files) {
        graph = buildCodeGraph(parsed);
      }
    } catch {
      /* ignore */
    }
  }

  if (!graph) {
    return NextResponse.json({ error: "No graph data" }, { status: 400 });
  }

  // Compute graph statistics
  const stats = computeGraphStats(graph);

  // Resolve AI provider — priority: Platform AI (admin) → DB credential (BYOK)
  let aiConfig = await getPlatformAIConfig();
  let usedPlatformAI = !!aiConfig;

  if (!aiConfig) {
    const cred = await db.providerCredential.findFirst({
      where: { userId, enabled: true },
      orderBy: { updatedAt: "desc" },
    });
    if (cred) {
      try {
        const { decrypt } = await import("@/lib/crypto");
        aiConfig = {
          providerId: cred.providerId,
          apiKey: decrypt(cred.encryptedApiKey),
          baseUrl: cred.baseUrl,
          model: cred.model,
          temperature: cred.temperature ?? 0.3,
          maxTokens: cred.maxTokens ?? 4000,
          timeout: 50,
        };
        usedPlatformAI = false;
      } catch {
        /* ignore — fall through to "no provider" */
      }
    }
  }

  if (!aiConfig) {
    return NextResponse.json({ error: "No AI provider" }, { status: 400 });
  }

  // BYOK users (their own key) do NOT use the admin's fallback chain —
  // different providers would require different keys the user doesn't have.
  const fallbacks = usedPlatformAI ? await getFallbackChain() : [];

  // Resolve locale from cookie (lazy-loaded GET — no body to read it from)
  const langCookie = _req.cookies.get("codeinsight-lang")?.value;
  const lang = langCookie === "vi" ? "vi" : "en";

  const langInstruction =
    lang === "vi"
      ? "\n\nQUAN TRỌNG: Trả lời bằng tiếng Việt. Giữ nguyên file paths, thuật ngữ kỹ thuật."
      : "\n\nIMPORTANT: Respond in English. Keep file paths and technical terms as-is.";

  const prompt = `Analyze this code dependency graph and provide architectural insights.

Graph Stats:
- Total nodes: ${stats.totalNodes}
- Total edges: ${stats.totalEdges}
- Avg connectivity: ${stats.avgConnectivity.toFixed(1)}
- Self-loop (circular) edges: ${stats.circularDeps}

Top central nodes (highest connectivity — potential bottlenecks):
${stats.centralNodes.map((n) => `- ${n.label} (${n.filePath}) [${n.type}] — ${n.connectivity} connections (fan-in: ${n.fanIn}, fan-out: ${n.fanOut})`).join("\n") || "- (none)"}

Top fragile modules (high fan-in × fan-out — change here breaks many things AND depends on many):
${stats.fragileModules.map((n) => `- ${n.label} (${n.filePath}) — fan-in: ${n.fanIn}, fan-out: ${n.fanOut}, fragility score: ${n.fragility}`).join("\n") || "- (none)"}

Cascade risk (nodes whose change impacts the most other nodes via reverse BFS):
${stats.cascadeRisk.map((n) => `- ${n.label} (${n.filePath}) — impacts ${n.impactedCount} other nodes`).join("\n") || "- (none)"}

Provide insights as JSON with this exact shape:
{
  "centralNodes": [{"node": "file path or symbol", "why": "1-sentence reason it's central", "risk": "what breaks if it changes"}],
  "fragileModules": [{"node": "file path", "why": "1-sentence reason it's fragile", "cascadeRisk": "what cascade failures look like"}],
  "refactorSequence": [{"step": "short step name", "target": "file path or symbol to refactor", "reason": "why this order"}],
  "overallAssessment": "2-3 sentence architectural health narrative"
}

Limit to top 3 centralNodes, top 3 fragileModules, and 3-5 refactorSequence steps.`;

  const messages: AIMessage[] = [
    {
      role: "system",
      content:
        "You are a software architect specializing in dependency-graph analysis. Respond in valid JSON only, no markdown fences, no explanation. Start with { and end with }." +
        langInstruction,
    },
    { role: "user", content: prompt },
  ];

  // Resolve the user's plan so callAIWithFallback's budget check works.
  const planInfo = await getUserPlanInfo(userId);

  try {
    const result: AICallResult & { providerUsed?: string; attemptedProviders?: any[] } =
      await callAIWithFallback(aiConfig, fallbacks, messages, {
        temperature: 0.3,
        maxTokens: 3000,
        timeout: 45,
        responseFormat: "json_object",
        userId,
        plan: planInfo.plan,
        audit: { userId, analysisId, agent: "codegraph-insight" },
      });

    let insight: any = null;
    if (result.content) {
      let cleaned = result.content
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");
      try {
        insight = JSON.parse(cleaned);
      } catch {
        // Fallback: extract first {...} block
        const f = cleaned.indexOf("{");
        const l = cleaned.lastIndexOf("}");
        if (f !== -1 && l !== -1 && l > f) {
          try {
            insight = JSON.parse(cleaned.slice(f, l + 1));
          } catch {
            // Try once more stripping trailing commas
            try {
              insight = JSON.parse(
                cleaned.slice(f, l + 1).replace(/,(\s*[}\]])/g, "$1"),
              );
            } catch {
              insight = null;
            }
          }
        }
      }
    }

    return NextResponse.json({
      insight,
      stats,
      providerUsed: (result as any).providerUsed ?? result.providerId,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "AI insight failed" },
      { status: 500 },
    );
  }
}

// ── Graph statistics ──
//
// Computes:
//   - in/out degree for every node (single pass over edges)
//   - central nodes = highest total degree (in + out), filtered to
//     file/function/class nodes (modules + routes pollute "centrality")
//   - fragile modules = high fan-in × fan-out (change here = many things
//     break + depends on many) — restricted to file nodes only
//   - cascade risk = BFS-reachable set size via reverse edges (what breaks
//     if this node changes), computed only for the top 20 file nodes by
//     connectivity to keep the O(V·E) cost bounded
function computeGraphStats(graph: any): GraphStats {
  const nodes: any[] = graph.nodes || [];
  const edges: any[] = graph.edges || [];

  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    outDegree.set(n.id, 0);
  }
  for (const e of edges) {
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    outDegree.set(e.from, (outDegree.get(e.from) || 0) + 1);
  }

  // Central nodes — file / function / class only (skip module/route/import
  // noise that always has high degree by construction)
  const centralNodes = nodes
    .filter((n) => n.type === "file" || n.type === "function" || n.type === "class")
    .map((n) => {
      const fanIn = inDegree.get(n.id) || 0;
      const fanOut = outDegree.get(n.id) || 0;
      return {
        id: n.id,
        label: n.label,
        filePath: n.filePath,
        type: n.type,
        connectivity: fanIn + fanOut,
        fanIn,
        fanOut,
      };
    })
    .sort((a, b) => b.connectivity - a.connectivity)
    .slice(0, 5);

  // Fragile modules — file nodes with high fan-in × fan-out
  const fragileModules = nodes
    .filter((n) => n.type === "file")
    .map((n) => {
      const fanIn = inDegree.get(n.id) || 0;
      const fanOut = outDegree.get(n.id) || 0;
      return {
        id: n.id,
        label: n.label,
        filePath: n.filePath,
        fanIn,
        fanOut,
        fragility: fanIn * fanOut,
      };
    })
    .filter((n) => n.fragility > 0)
    .sort((a, b) => b.fragility - a.fragility)
    .slice(0, 5);

  // Cascade risk — reverse-BFS reachable set size from each candidate node.
  // Only evaluate the top 20 file nodes by total degree to bound the cost.
  // Build reverse adjacency: for each node, which nodes point TO it (callers).
  const reverseAdj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.from === e.to) continue; // skip self-loops
    let s = reverseAdj.get(e.to);
    if (!s) {
      s = new Set();
      reverseAdj.set(e.to, s);
    }
    s.add(e.from);
  }

  const cascadeCandidates = nodes
    .filter((n) => n.type === "file")
    .map((n) => ({
      id: n.id,
      label: n.label,
      filePath: n.filePath,
      degree: (inDegree.get(n.id) || 0) + (outDegree.get(n.id) || 0),
    }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 20);

  const cascadeRisk = cascadeCandidates
    .map((c) => ({
      ...c,
      impactedCount: bfsReachable(reverseAdj, c.id),
    }))
    .sort((a, b) => b.impactedCount - a.impactedCount)
    .slice(0, 5);

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    avgConnectivity: edges.length / Math.max(nodes.length, 1),
    circularDeps: edges.filter((e: any) => e.from === e.to).length,
    centralNodes,
    fragileModules,
    cascadeRisk,
  };
}

// BFS over reverse adjacency — returns the count of distinct nodes that
// transitively depend on `startId` (i.e., what breaks if `startId` changes).
function bfsReachable(reverseAdj: Map<string, Set<string>>, startId: string): number {
  const visited = new Set<string>([startId]);
  const queue: string[] = [startId];
  let count = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const callers = reverseAdj.get(cur);
    if (!callers) continue;
    for (const c of callers) {
      if (!visited.has(c)) {
        visited.add(c);
        count++;
        queue.push(c);
      }
    }
  }
  return count;
}
