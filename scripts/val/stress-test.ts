// Validation 11 — Stress Test
// Generates a large synthetic SPM (10k files, 300k symbols, 100k edges, 50k issues)
// and measures performance of all agent layers.

import { buildIndexes } from "@/lib/agent/indexes";
import { createQueryService } from "@/lib/agent/query";
import { createServices } from "@/lib/agent/services";
import { createRegistries } from "@/lib/agent/tools";
import { createContextBuilder, TokenBudgetManager } from "@/lib/agent/context";
import { createPlanner, PlanValidator } from "@/lib/agent/planner";
import { createRuntime } from "@/lib/agent/runtime";
import { createAgentMemory } from "@/lib/agent/memory";
import type {
  SemanticProjectModel,
  SemanticFile,
  SemanticSymbol,
  SemanticEdge,
  SemanticIssue,
  AgentContext,
  ContextNeed,
} from "@/lib/agent/contracts";

function nowMs() { return performance.now(); }
function fmtMs(ms: number) { return ms < 1 ? `${ms.toFixed(3)}ms` : `${ms.toFixed(1)}ms`; }
function memMB() {
  const m = process.memoryUsage();
  return { rss: +(m.rss / 1048576).toFixed(1), heapUsed: +(m.heapUsed / 1048576).toFixed(1), heapTotal: +(m.heapTotal / 1048576).toFixed(1) };
}

// ─── Generate large synthetic SPM ─────────────────────────────────────
function generateLargeSPM(targetFiles: number, symbolsPerFile: number, edgesPerSymbol: number, issuesPerFile: number): SemanticProjectModel {
  const files: SemanticFile[] = [];
  const symbols: SemanticSymbol[] = [];
  const edges: SemanticEdge[] = [];
  const issues: SemanticIssue[] = [];

  const kinds = ["function", "class", "variable", "interface", "type"] as const;
  const categories = ["security", "bugs", "performance", "architecture", "style"] as const;
  const severities = ["critical", "high", "medium", "low", "info"] as const;

  for (let fi = 0; fi < targetFiles; fi++) {
    const path = `src/mod${fi % 100}/file${fi}.ts`;
    const fileSymbols: string[] = [];
    const lines = 50 + (fi % 200);
    let content = `// File ${fi}\n`;
    for (let si = 0; si < symbolsPerFile; si++) {
      const name = `fn${fi}_${si}`;
      const kind = kinds[(fi + si) % kinds.length];
      const sid = `${path}::${name}::${kind}`;
      fileSymbols.push(sid);
      symbols.push({
        id: sid, name, kind, file: path, line: si + 2, exported: si % 3 === 0,
        parameters: kind === "function" ? [{ name: "arg0", type: "string" }] : undefined,
        returnType: kind === "function" ? "Promise<void>" : undefined,
      });
      content += `export ${kind === "class" ? "class" : kind === "function" ? "function" : "const"} ${name}() { /* ... */ }\n`;

      // Edges
      for (let ei = 0; ei < edgesPerSymbol; ei++) {
        const targetIdx = (fi * symbolsPerFile + si + ei + 1) % symbols.length;
        const targetSym = symbols[targetIdx];
        if (targetSym) {
          edges.push({
            id: `e${fi}_${si}_${ei}`,
            type: ei % 2 === 0 ? "calls" : "uses",
            source: sid,
            target: targetSym.id,
            file: path,
            line: si + 2,
          });
        }
      }
    }
    files.push({ path, language: "typescript", lines, content, symbols: fileSymbols, imports: [`@/mod${(fi + 1) % 100}`, `@/mod${(fi + 2) % 100}`] });

    // Issues
    for (let ii = 0; ii < issuesPerFile; ii++) {
      issues.push({
        id: `issue_${fi}_${ii}`,
        category: categories[(fi + ii) % categories.length],
        severity: severities[(fi + ii) % severities.length],
        title: `Issue ${fi}_${ii}`,
        description: `Description for issue ${fi}_${ii}`,
        file: path,
        line: ii + 1,
        recommendation: "Fix it",
        effort: "small",
      });
    }
  }

  return {
    id: "stress/large-project/1",
    repoOwner: "stress",
    repoName: "large-project",
    branch: "main",
    commitSha: "stress123",
    createdAt: new Date().toISOString(),
    files,
    symbols,
    edges,
    issues,
    insights: [],
    architecture: { pattern: "Modular", strengths: [], weaknesses: [], layers: ["core", "api"], layerViolations: [] },
    metrics: {
      totalFiles: files.length, totalLines: files.reduce((s, f) => s + f.lines, 0),
      totalSymbols: symbols.length, totalEdges: edges.length,
      cyclomaticComplexity: 0, maintainabilityIndex: 65, couplingScore: 0.5, cohesionScore: 0.6,
    },
    schemaVersion: 1,
  };
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  VALIDATION 11 — Stress Test                                    ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");

  const memStart = memMB();
  console.log(`\nBaseline memory: ${JSON.stringify(memStart)}`);

  // Target: 10000 files, 300000 symbols (30/file), 100000 edges, 50000 issues (5/file)
  // To hit 300k symbols: 10000 files × 30 symbols = 300k. To hit 100k edges: need edgesPerSymbol such that total ~100k.
  // 300k symbols × edgesPerSymbol = 100k → edgesPerSymbol = 0.33. But we want integer. Let's do 20000 files × 15 symbols = 300k symbols, edgesPerSymbol=0 doesn't work.
  // Simpler: 10000 files × 30 symbols = 300k symbols. Edges: 30 symbols × 0.33 → round to 0 then add separate. Actually let's just do edgesPerSymbol such that 300k * X = 100k → X ≈ 0.33.
  // Practical: 10000 files, 30 symbols/file = 300k, edgesPerSymbol = 0 (skip) + we add 100k random edges separately.
  // But the generator above adds edges inline. Let's use edgesPerSymbol = 0 and add edges in a second pass.
  // Actually, to be efficient, let's do: 10000 files × 30 symbols = 300k, edgesPerSymbol = 1 → 300k edges (more than 100k, fine — tests "stress").
  // issuesPerFile = 5 → 50k issues.

  const TARGET_FILES = 10000;
  const SYMBOLS_PER_FILE = 30;  // → 300,000 symbols
  const EDGES_PER_SYMBOL = 1;   // → ~300,000 edges (>= 100,000 target)
  const ISSUES_PER_FILE = 5;    // → 50,000 issues

  console.log(`\nGenerating SPM: ${TARGET_FILES} files × ${SYMBOLS_PER_FILE} symbols × ${EDGES_PER_SYMBOL} edges, ${ISSUES_PER_FILE} issues/file`);
  const tGen0 = nowMs();
  const spm = generateLargeSPM(TARGET_FILES, SYMBOLS_PER_FILE, EDGES_PER_SYMBOL, ISSUES_PER_FILE);
  const tGen = nowMs() - tGen0;
  const memAfterGen = memMB();
  console.log(`  Generated in ${fmtMs(tGen)}`);
  console.log(`  Files: ${spm.files.length}, Symbols: ${spm.symbols.length}, Edges: ${spm.edges.length}, Issues: ${spm.issues.length}`);
  console.log(`  Memory after gen: ${JSON.stringify(memAfterGen)} (Δ heap +${(memAfterGen.heapUsed - memStart.heapUsed).toFixed(1)} MB)`);

  // Estimate SPM size in memory (rough)
  const spmJson = JSON.stringify(spm);
  console.log(`  SPM JSON size: ${(spmJson.length / 1048576).toFixed(1)} MB`);

  // ─── 1. Index build ────────────────────────────────────────────────
  console.log("\n--- 1. Index Build ---");
  const tIdx0 = nowMs();
  const indexes = buildIndexes(spm);
  const tIdx = nowMs() - tIdx0;
  console.log(`  Index build: ${fmtMs(tIdx)}`);
  console.log(`  Memory after index: ${JSON.stringify(memMB())}`);

  // ─── 2. Query Service ──────────────────────────────────────────────
  console.log("\n--- 2. Query Service Operations ---");
  const querySvc = createQueryService(spm, indexes);
  const memBeforeQ = memMB();

  // findSymbol
  const tFindSym0 = nowMs();
  const symResult = querySvc.findSymbol("fn0_0");
  const tFindSym = nowMs() - tFindSym0;
  console.log(`  findSymbol("fn0_0"): ${fmtMs(tFindSym)} → ${symResult.ok ? symResult.value.length + " results" : "ERR"}`);

  // searchCode
  const tSearch0 = nowMs();
  const searchResult = querySvc.searchCode("export function");
  const tSearch = nowMs() - tSearch0;
  console.log(`  searchCode("export function"): ${fmtMs(tSearch)} → ${searchResult.ok ? searchResult.value.length + " files" : "ERR"}`);

  // findIssues (all)
  const tIssues0 = nowMs();
  const issuesResult = querySvc.findIssues({ severity: "critical" });
  const tIssues = nowMs() - tIssues0;
  console.log(`  findIssues({severity:"critical"}): ${fmtMs(tIssues)} → ${issuesResult.ok ? issuesResult.value.length + " issues" : "ERR"}`);

  // findImpact (BFS)
  const tImpact0 = nowMs();
  const firstSym = spm.symbols[0];
  const impactResult = firstSym ? querySvc.findImpact(firstSym.id) : { ok: false, error: { code: "X", message: "no symbol" } } as any;
  const tImpact = nowMs() - tImpact0;
  console.log(`  findImpact(firstSymbol): ${fmtMs(tImpact)} → ${impactResult.ok ? `${impactResult.value.directlyImpacted.length} direct, ${impactResult.value.transitivelyImpacted.length} transitive` : "ERR"}`);

  // findCircularDependencies (Tarjan)
  const tCycles0 = nowMs();
  const cyclesResult = querySvc.findCircularDependencies();
  const tCycles = nowMs() - tCycles0;
  console.log(`  findCircularDependencies(): ${fmtMs(tCycles)} → ${cyclesResult.ok ? cyclesResult.value.length + " cycles" : "ERR"}`);

  // getMetrics
  const tMetrics0 = nowMs();
  const metricsResult = querySvc.getMetrics();
  const tMetrics = nowMs() - tMetrics0;
  console.log(`  getMetrics(): ${fmtMs(tMetrics)}`);

  console.log(`  Memory after queries: ${JSON.stringify(memMB())} (Δ +${(memMB().heapUsed - memBeforeQ.heapUsed).toFixed(1)} MB)`);

  // ─── 3. Context Builder ────────────────────────────────────────────
  console.log("\n--- 3. Context Builder ---");
  const services = createServices(spm);
  const memory = createAgentMemory();
  memory.project.setSPM(spm);
  memory.project.setIndexes(indexes);
  const context: AgentContext = { spm, query: querySvc, memory, analysisId: "stress-1", locale: "en" };
  const ctxBuilder = createContextBuilder();
  const budget = TokenBudgetManager.forModel("gpt-4.1-mini");

  // Build context with 20 needs
  const needs: ContextNeed[] = [];
  for (let i = 0; i < 20; i++) {
    const file = spm.files[i % spm.files.length];
    needs.push({ type: "file", ref: file.path, priority: i < 5 ? "critical" : i < 15 ? "important" : "nice-to-have" });
  }
  needs.push({ type: "issues", ref: spm.files[0].path, priority: "critical" });
  needs.push({ type: "architecture", ref: "", priority: "important" });

  const tCtx0 = nowMs();
  const ctxResult = ctxBuilder.build(needs, budget, context);
  const tCtx = nowMs() - tCtx0;
  console.log(`  ContextBuilder.build(23 needs): ${fmtMs(tCtx)} → ${ctxResult.ok ? `${ctxResult.value.tokens} tokens, truncated=${ctxResult.value.truncated}` : "ERR: " + ctxResult.error.message}`);

  // ─── 4. Planner ────────────────────────────────────────────────────
  console.log("\n--- 4. Planner ---");
  const { toolRegistry } = createRegistries();
  const allCapabilities = Array.from(new Set((toolRegistry as any).listAllManifests().flatMap(m => m.capabilities))) as any[];
  const planner = createPlanner(allCapabilities);
  const tPlan0 = nowMs();
  const planResult = await planner.plan("Find performance issues and explain the architecture", context);
  const tPlan = nowMs() - tPlan0;
  console.log(`  Planner.plan(): ${fmtMs(tPlan)} → ${planResult.ok ? `${planResult.value.graph.nodes.length} nodes` : "ERR: " + planResult.error.message}`);

  // Plan validation
  if (planResult.ok) {
    const validator = new PlanValidator();
    const tValid0 = nowMs();
    const valid = validator.validate(planResult.value, allCapabilities);
    const tValid = nowMs() - tValid0;
    console.log(`  PlanValidator.validate(): ${fmtMs(tValid)} → ${valid.ok ? "PASS" : "FAIL: " + valid.error.message.substring(0, 100)}`);
  }

  // ─── 5. Runtime (execute the plan) ────────────────────────────────
  console.log("\n--- 5. Runtime Execution ---");
  if (planResult.ok) {
    const runtime = createRuntime(toolRegistry);
    const tRun0 = nowMs();
    let eventCount = 0;
    const eventTypes: Record<string, number> = {};
    try {
      for await (const event of runtime.run(planResult.value, context)) {
        eventCount++;
        eventTypes[(event as any).type] = (eventTypes[(event as any).type] || 0) + 1;
      }
    } catch (e: any) {
      console.log(`  Runtime threw: ${e.message}`);
    }
    const tRun = nowMs() - tRun0;
    console.log(`  Runtime.run(): ${fmtMs(tRun)} → ${eventCount} events`);
    console.log(`  Event types: ${JSON.stringify(eventTypes)}`);
  }

  // ─── 6. Summary ───────────────────────────────────────────────────
  const memEnd = memMB();
  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  STRESS TEST SUMMARY                                            ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log(`SPM size:        ${spm.files.length} files, ${spm.symbols.length} symbols, ${spm.edges.length} edges, ${spm.issues.length} issues`);
  console.log(`SPM JSON:        ${(spmJson.length / 1048576).toFixed(1)} MB`);
  console.log(`Index build:     ${fmtMs(tIdx)}`);
  console.log(`findSymbol:      ${fmtMs(tFindSym)}`);
  console.log(`searchCode:      ${fmtMs(tSearch)}`);
  console.log(`findIssues:      ${fmtMs(tIssues)}`);
  console.log(`findImpact:      ${fmtMs(tImpact)}`);
  console.log(`findCycles:      ${fmtMs(tCycles)}`);
  console.log(`getMetrics:      ${fmtMs(tMetrics)}`);
  console.log(`Context build:   ${fmtMs(tCtx)}`);
  console.log(`Planner:         ${fmtMs(tPlan)}`);
  console.log(`Runtime:         ${planResult.ok ? "(measured above)" : "N/A"}`);
  console.log(`Memory start:    ${memStart.heapUsed} MB heap`);
  console.log(`Memory peak/end: ${memEnd.heapUsed} MB heap`);
  console.log(`Memory delta:    +${(memEnd.heapUsed - memStart.heapUsed).toFixed(1)} MB heap`);
  console.log(`RSS:             ${memStart.rss} → ${memEnd.rss} MB`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
