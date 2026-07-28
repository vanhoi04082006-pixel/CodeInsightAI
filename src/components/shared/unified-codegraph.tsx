"use client";

// UnifiedCodeGraph — List + Detail layout (replaces the previous D3-force SVG canvas).
//
// Data flow unchanged:
//   - graphType → /api/graph/[id]?type=X&q=full → { nodes, edges, stats, aiConfig }
//   - node click → ?q=inspector&node=ID  (lazy)
//   - "Impact Analysis" → ?q=impact&node=ID  (reverse-BFS dependents)
//   - AI button → POST /api/chat with aiConfig.prompt + serialized stats/cycles;
//     cached per analysisId+graphType in sessionStorage.
//
// Removed: d3-force simulation, manual SVG pan/zoom/drag, minimap, SimNode.
// Added:   sortable/searchable node list (windowed >200), detail panel,
//          impact-analysis card, S/M/L font-size toggle.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Network, Loader2, ChevronDown, Filter, FileCode, Zap, Database,
  Route as RouteIcon, Package, Box, Sparkles, AlertTriangle, Copy, AlertCircle,
  ArrowRight, ArrowLeft, Wand2,
} from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useT, useI18nStore } from "@/lib/i18n";
import { ALL_GRAPH_TYPES } from "@/lib/graph/providers";
import type { GraphType, GraphNode, GraphEdge, GraphStats, InspectorData, GraphAIConfig } from "@/lib/graph/types";
import type { AnalysisReport } from "@/lib/types";

/* ───────────────────────── Constants ───────────────────────── */

const TYPE_META: Record<string, { icon: any; color: string }> = {
  file: { icon: FileCode, color: "#22d3ee" },
  function: { icon: Zap, color: "#a78bfa" },
  class: { icon: Database, color: "#f472b6" },
  module: { icon: Package, color: "#fbbf24" },
  route: { icon: RouteIcon, color: "#34d399" },
  component: { icon: Box, color: "#60a5fa" },
  import: { icon: Filter, color: "#fb923c" },
  service: { icon: Network, color: "#a78bfa" },
  util: { icon: Zap, color: "#fbbf24" },
};
const EDGE_COLORS: Record<string, string> = {
  imports: "#67e8f9", calls: "#a78bfa", extends: "#f472b6", implements: "#34d399",
  uses: "#fbbf24", depends_on: "#475569", exports: "#60a5fa",
};

type FontScale = "sm" | "md" | "lg";
const FONT_SCALE_CLASS: Record<FontScale, { list: string; detail: string; rowH: number }> = {
  sm: { list: "text-[11px]", detail: "text-xs", rowH: 26 },
  md: { list: "text-xs", detail: "text-sm", rowH: 32 },
  lg: { list: "text-sm", detail: "text-base", rowH: 40 },
};
const ROW_BUFFER = 8;
const ROW_CAP_NO_WINDOW = 200;

const getTypeMeta = (type: string) => TYPE_META[type] || { icon: Network, color: "#94a3b8" };
const labelOrKey = (t: (ns: string, k: string) => string, ns: string, key: string, fallback: string) => {
  const full = `${ns}.${key}`;
  const v = t(ns, key);
  return v === full ? fallback : v;
};
const nodeTypeLabel = (t: (ns: string, k: string) => string, type: string) =>
  labelOrKey(t, "codegraph", `nodeTypes.${type}`, type);
const edgeTypeLabel = (t: (ns: string, k: string) => string, type: string) =>
  labelOrKey(t, "codegraph", `edgeTypes.${type}`, type);

/* ───────────────────────── Component ───────────────────────── */

export function UnifiedCodeGraph({ analysisId, report }: { analysisId: string | null; report: AnalysisReport }) {
  const { t } = useT();
  const [graphType, setGraphType] = useState<GraphType>("dependencies");

  // Graph payload.
  const [allNodes, setAllNodes] = useState<GraphNode[]>([]);
  const [allEdges, setAllEdges] = useState<GraphEdge[]>([]);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [aiConfig, setAiConfig] = useState<GraphAIConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // View state.
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [inspector, setInspector] = useState<InspectorData | null>(null);
  const [fontScale, setFontScale] = useState<FontScale>("md");
  const [typeFilter, setTypeFilter] = useState<Set<string> | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Impact analysis.
  const [impact, setImpact] = useState<{ count: number; depth: number; sample: GraphNode[] } | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState<string | null>(null);

  // AI insight (per-graph-type sessionStorage cache).
  const aiStorageKey = analysisId ? `unified-graph-ai-${analysisId}-${graphType}` : "";
  const [aiInsight, setAiInsight] = useState<string | null>(() => {
    if (!aiStorageKey || typeof window === "undefined") return null;
    try { return sessionStorage.getItem(aiStorageKey); } catch { return null; }
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiExpanded, setAiExpanded] = useState<boolean>(() => {
    if (!aiStorageKey || typeof window === "undefined") return false;
    try { return !!sessionStorage.getItem(aiStorageKey); } catch { return false; }
  });

  // Reset AI cache + selection on graph-type switch.
  useEffect(() => {
    if (!aiStorageKey || typeof window === "undefined") {
      setAiInsight(null); setAiExpanded(false);
    } else {
      try {
        const cached = sessionStorage.getItem(aiStorageKey);
        setAiInsight(cached); setAiExpanded(!!cached);
      } catch { setAiInsight(null); setAiExpanded(false); }
    }
    setAiError(null); setSelected(null); setInspector(null); setImpact(null);
    setSearch(""); setTypeFilter(null);
  }, [aiStorageKey, graphType]);

  // Fetch full graph whenever analysisId / graphType changes.
  useEffect(() => {
    if (!analysisId) {
      setLoading(false); setAllNodes([]); setAllEdges([]); setStats(null);
      return;
    }
    setLoading(true); setLoadError(null);
    const ctrl = new AbortController();
    fetch(`/api/graph/${analysisId}?type=${graphType}&q=full`, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: { nodes: GraphNode[]; edges: GraphEdge[]; stats: GraphStats; aiConfig: GraphAIConfig }) => {
        setAllNodes(data.nodes ?? []);
        setAllEdges(data.edges ?? []);
        setStats(data.stats ?? null);
        setAiConfig(data.aiConfig ?? null);
      })
      .catch((e) => { if (e?.name !== "AbortError") setLoadError(e?.message || "Failed to load graph"); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [analysisId, graphType]);

  const visibleNodes = useMemo(() => {
    let filtered = typeFilter && typeFilter.size > 0 ? allNodes.filter((n) => typeFilter.has(n.type)) : allNodes;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (n) =>
          n.label.toLowerCase().includes(q) ||
          (n.filePath?.toLowerCase().includes(q) ?? false) ||
          n.id.toLowerCase().includes(q),
      );
    }
    return [...filtered].sort((a, b) => {
      const la = a.label.toLowerCase(), lb = b.label.toLowerCase();
      if (la !== lb) return la < lb ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }, [allNodes, typeFilter, search]);

  const presentTypes = useMemo(() => Array.from(new Set(allNodes.map((n) => n.type))), [allNodes]);

  const degreeMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of allNodes) m.set(n.id, 0);
    for (const e of allEdges) {
      m.set(e.from, (m.get(e.from) || 0) + 1);
      m.set(e.to, (m.get(e.to) || 0) + 1);
    }
    return m;
  }, [allNodes, allEdges]);

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of allNodes) m.set(n.id, n);
    return m;
  }, [allNodes]);

  // Node click → fetch inspector.
  const handleNodeClick = (node: GraphNode) => {
    setSelected(node.id);
    setImpact(null); setImpactError(null);
    if (!analysisId) {
      setInspector({ node, incoming: [], outgoing: [], neighbors: [] });
      return;
    }
    fetch(`/api/graph/${analysisId}?type=${graphType}&q=inspector&node=${encodeURIComponent(node.id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.inspector) setInspector(data.inspector as InspectorData);
        else setInspector({ node, incoming: [], outgoing: [], neighbors: [] });
      })
      .catch(() => setInspector({ node, incoming: [], outgoing: [], neighbors: [] }));
  };

  // Impact analysis: reverse-BFS dependent set. Depth isn't returned by the
  // API, so we re-derive it locally from the edge index on the impacted set.
  const runImpact = async () => {
    if (!analysisId || !selected || impactLoading) return;
    setImpactLoading(true); setImpactError(null);
    try {
      const r = await fetch(`/api/graph/${analysisId}?type=${graphType}&q=impact&node=${encodeURIComponent(selected)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const impacted: GraphNode[] = Array.isArray(data?.impacted) ? data.impacted : [];
      let depth = 0;
      if (impacted.length > 0) {
        const ids = new Set(impacted.map((n) => n.id));
        const adj = new Map<string, string[]>();
        for (const e of allEdges) {
          if (!ids.has(e.from) || !ids.has(e.to)) continue;
          (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from);
        }
        const visited = new Set<string>([selected]);
        let frontier = [selected];
        while (frontier.length > 0) {
          depth += 1;
          const next: string[] = [];
          for (const id of frontier) {
            for (const dep of adj.get(id) ?? []) {
              if (!visited.has(dep)) { visited.add(dep); next.push(dep); }
            }
          }
          frontier = next;
          if (depth > 50) break;
        }
        depth = Math.max(0, depth - 1);
      }
      setImpact({ count: impacted.length, depth, sample: impacted.slice(0, 8) });
    } catch (e: any) {
      setImpactError(e?.message || "Failed to compute impact");
    } finally {
      setImpactLoading(false);
    }
  };

  // AI Analysis (cached per-type in sessionStorage).
  const runAiInsight = async () => {
    if (!analysisId || aiLoading || !aiConfig) return;
    setAiLoading(true); setAiError(null); setAiExpanded(true);

    const top: Array<{ id: string; label: string; type: string; degree: number }> = [];
    for (const [id, deg] of [...degreeMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      const n = nodeById.get(id);
      if (n) top.push({ id, label: n.label, type: n.type, degree: deg });
    }
    const cycles = stats?.circularDeps ?? [];
    const contextBlock = [
      `Graph type: ${graphType}`,
      stats ? `Stats: ${stats.totalNodes} nodes · ${stats.totalEdges} edges · avg connectivity ${stats.avgConnectivity}` : "",
      stats?.byNodeType ? `By node type: ${JSON.stringify(stats.byNodeType)}` : "",
      stats?.byEdgeType ? `By edge type: ${JSON.stringify(stats.byEdgeType)}` : "",
      cycles.length > 0
        ? `Circular dependencies (${cycles.length}): ${cycles.slice(0, 5).map((c) => c.join("→")).join(" | ")}`
        : "No circular dependencies detected.",
      top.length > 0
        ? `Top nodes by degree:\n${top.map((n) => `- ${n.label} [${n.type}] — degree ${n.degree}`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n");

    const userMessage = `${aiConfig.prompt}\n\n--- GRAPH CONTEXT ---\n${contextBlock}\n\nProvide concrete, actionable findings. Cite specific node labels. Respond in plain text (markdown OK).`;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, language: useI18nStore.getState().locale }),
      });
      const data = await res.json();
      const reply: string = data.reply || data.message?.content || "No response";
      setAiInsight(reply);
      if (aiStorageKey) {
        try { sessionStorage.setItem(aiStorageKey, reply); } catch { /* quota */ }
      }
    } catch (e: any) {
      setAiError(e?.message || t("codegraph", "aiInsight.failed"));
    } finally {
      setAiLoading(false);
    }
  };

  const toggleTypeFilter = (type: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next.size === 0 ? null : next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <GraphTypeSelector graphType={graphType} onChange={setGraphType} />
        <GlassCard className="flex h-96 items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" />
            <p className="mt-2 text-sm text-muted-foreground">{t("codegraph", "building")}</p>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <GraphTypeSelector graphType={graphType} onChange={setGraphType} />
        <GlassCard className="flex h-96 items-center justify-center border-amber-500/20 bg-amber-500/[0.03]">
          <div className="text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
            <p className="mt-2 text-sm text-amber-300">{loadError}</p>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GraphTypeSelector graphType={graphType} onChange={setGraphType} />

      {/* AI Analysis card */}
      <GlassCard className="overflow-hidden border-violet-400/20 bg-gradient-to-br from-violet-500/[0.04] to-cyan-500/[0.04] p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/15 text-violet-300">
              <Sparkles className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold">
              <GradientText>{aiConfig?.title || t("codegraph", "aiInsight.title")}</GradientText>
            </h3>
            <Badge variant="outline" className="border-violet-400/30 bg-violet-500/10 text-[10px] text-violet-200">
              ✨ AI · {ALL_GRAPH_TYPES.find((g) => g.type === graphType)?.label}
            </Badge>
          </div>
          <Button
            size="sm" variant="ghost" onClick={runAiInsight} disabled={aiLoading || !analysisId}
            className="h-8 gap-1.5 border border-violet-400/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 hover:text-violet-100"
          >
            {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {t("codegraph", "aiInsight.button")}
          </Button>
        </div>
        <AnimatePresence initial={false}>
          {aiExpanded && (aiLoading || aiError || aiInsight) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden"
            >
              {aiLoading && (
                <div className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] p-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-300" />
                  {t("codegraph", "aiInsight.loading")}
                </div>
              )}
              {aiError && !aiLoading && (
                <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/[0.06] p-3 text-xs text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="break-all">{aiError}</span>
                </div>
              )}
              {aiInsight && !aiLoading && !aiError && (
                <div className="rounded-md border border-violet-400/15 bg-violet-500/[0.03] p-3 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">
                  {aiInsight}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* Main split: Node List | Detail Panel */}
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <NodeListPanel
          nodes={visibleNodes} totalCount={allNodes.length} selected={selected}
          search={search} onSearch={setSearch} onSelect={handleNodeClick}
          fontScale={fontScale} onFontScale={setFontScale} stats={stats}
          presentTypes={presentTypes} typeFilter={typeFilter} onToggleType={toggleTypeFilter}
          showFilters={showFilters} onToggleFilters={() => setShowFilters((s) => !s)}
          degreeMap={degreeMap}
        />
        <DetailPanel
          inspector={inspector} nodeById={nodeById} degreeMap={degreeMap}
          onSelect={handleNodeClick} fontScale={fontScale} impact={impact}
          impactLoading={impactLoading} impactError={impactError} onRunImpact={runImpact}
          stats={stats}
        />
      </div>

      {/* Dead Code + Duplicate Code */}
      <ReportsGrid report={report} />
    </div>
  );
}

/* ───────────────────────── Reports (Dead Code + Duplicates) ───────────────────────── */

function ReportsGrid({ report }: { report: AnalysisReport }) {
  const { t } = useT();
  const deep = (report as any).deepAnalysis as any;
  const aiDuplicates: any[] | undefined = deep?.duplicateAnalysis;
  const aiPassesCompleted: string[] = (report as any)._aiPassesCompleted || [];
  const aiStatus = (report as any).aiStatus;
  const dupPassFailed =
    (aiStatus === "done" || aiStatus === "pending") &&
    !aiPassesCompleted.includes("duplicates") &&
    (!aiDuplicates || aiDuplicates.length === 0);
  const dupPassPending = aiStatus === "pending" && !aiPassesCompleted.includes("duplicates");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GlassCard className="p-5">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-rose-400" />
          <h4 className="text-sm font-semibold">
            {t("reports", "deadCode")} <span className="text-muted-foreground">({report.deadCode.length})</span>
          </h4>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("reports", "deadCodeDesc")}</p>
        <div className="mt-3 space-y-1.5">
          {report.deadCode.length === 0 ? (
            <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-3 text-xs text-emerald-300">
              {t("reports", "noDeadCode")}
            </p>
          ) : report.deadCode.map((d, i) => (
            <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                <p className="truncate font-mono text-[11px]">{d.path}</p>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{d.lines}L</span>
              </div>
              <p className="mt-1 pl-3.5 text-[10px] text-muted-foreground">{d.reason}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex items-center gap-2">
          <Copy className="h-4 w-4 text-amber-400" />
          <h4 className="text-sm font-semibold">
            {t("reports", "duplicateCode")} <span className="text-muted-foreground">({report.duplicates.length})</span>
          </h4>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("reports", "duplicateCodeDesc")}</p>
        <div className="mt-3 space-y-1.5">
          {report.duplicates.length === 0 ? (
            <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-3 text-xs text-emerald-300">
              {t("reports", "noDuplicates")}
            </p>
          ) : report.duplicates.map((d, i) => (
            <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
              <div className="flex items-center gap-2">
                <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
                  {t("reports", "group")} {d.group}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground">{d.lines} {t("reports", "linesDuplicated")}</span>
              </div>
              <div className="mt-1.5 space-y-0.5">
                {d.files.map((f) => (
                  <p key={f} className="truncate pl-3 font-mono text-[10px] text-muted-foreground">{f}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        {aiDuplicates && aiDuplicates.length > 0 && (
          <div className="mt-3 space-y-2">
            {aiDuplicates.map((d: any, i: number) => (
              <div key={`ai-${i}`} className="rounded-lg border border-violet-500/15 bg-violet-500/[0.03] p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-300">{d.type}</span>
                  {d.estimatedLinesSaved ? (
                    <span className="ml-auto text-[10px] text-emerald-300">
                      {t("reports", "aiInsights.estimatedLinesSaved")}: {d.estimatedLinesSaved}
                    </span>
                  ) : null}
                </div>
                {d.files?.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {d.files.map((f: string, j: number) => (
                      <p key={j} className="truncate pl-3 font-mono text-[10px] text-muted-foreground">{f}</p>
                    ))}
                  </div>
                )}
                {d.description && <p className="mt-1 text-xs text-muted-foreground">{d.description}</p>}
                {d.recommendation && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{t("reports", "aiInsights.recommendation")}:</span> {d.recommendation}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {dupPassFailed && (
          <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
              <p className="text-[11px] font-medium text-amber-300">{t("reports", "aiFallback.title")}</p>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {t("reports", "aiFallback.desc", { pass: t("reports", "aiInsights.duplicateAnalysis") })}
            </p>
          </div>
        )}
        {dupPassPending && (
          <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
              <p className="text-[11px] font-medium text-cyan-300">{t("reports", "aiFallback.pending")}</p>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

/* ───────────────────────── Node List (left) ───────────────────────── */

function NodeListPanel({
  nodes, totalCount, selected, search, onSearch, onSelect,
  fontScale, onFontScale, stats, presentTypes, typeFilter,
  onToggleType, showFilters, onToggleFilters, degreeMap,
}: {
  nodes: GraphNode[]; totalCount: number; selected: string | null;
  search: string; onSearch: (v: string) => void; onSelect: (n: GraphNode) => void;
  fontScale: FontScale; onFontScale: (s: FontScale) => void; stats: GraphStats | null;
  presentTypes: string[]; typeFilter: Set<string> | null; onToggleType: (t: string) => void;
  showFilters: boolean; onToggleFilters: () => void; degreeMap: Map<string, number>;
}) {
  const { t } = useT();
  const scaleCfg = FONT_SCALE_CLASS[fontScale];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const onResize = () => setViewportH(el.clientHeight);
    onResize();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); };
  }, []);

  // Windowing: only render visible rows + buffer (when list is large).
  const useWindowing = nodes.length > ROW_CAP_NO_WINDOW;
  const rowH = scaleCfg.rowH;
  const startIdx = useWindowing ? Math.max(0, Math.floor(scrollTop / rowH) - ROW_BUFFER) : 0;
  const visibleCount = useWindowing
    ? Math.min(nodes.length - startIdx, Math.ceil(viewportH / rowH) + ROW_BUFFER * 2)
    : nodes.length;
  const endIdx = startIdx + visibleCount;
  const slice = useWindowing ? nodes.slice(startIdx, endIdx) : nodes;

  return (
    <GlassCard className="flex h-[600px] flex-col overflow-hidden p-0">
      {/* Header: search + font toggle + filter */}
      <div className="space-y-2 border-b border-white/5 p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search} onChange={(e) => onSearch(e.target.value)}
              placeholder={t("codegraph", "searchNodes")}
              className="h-8 pl-8 text-xs bg-white/[0.03]"
            />
          </div>
          <Button
            size="sm" variant="ghost" onClick={onToggleFilters}
            className={cn("h-8 w-8 p-0", showFilters && "bg-white/10")}
            title={t("codegraph", "filterByType")}
          >
            <Filter className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("codegraph", "unified.fontSize")}
          </span>
          <div className="flex overflow-hidden rounded-md border border-white/10">
            {(["sm", "md", "lg"] as FontScale[]).map((s) => (
              <button
                key={s} onClick={() => onFontScale(s)}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-semibold transition",
                  fontScale === s ? "bg-cyan-500/20 text-cyan-200" : "text-muted-foreground hover:bg-white/5",
                )}
              >
                {t("codegraph", `unified.fontSize${s === "sm" ? "Small" : s === "md" ? "Medium" : "Large"}`)}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }} className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-1 pt-1">
                {presentTypes.map((type) => {
                  const meta = getTypeMeta(type);
                  const Icon = meta.icon;
                  const active = !typeFilter || typeFilter.has(type);
                  return (
                    <button
                      key={type} onClick={() => onToggleType(type)}
                      className={cn(
                        "flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition",
                        active ? "border-white/10 bg-white/[0.04] text-foreground" : "border-white/5 text-muted-foreground opacity-50",
                      )}
                    >
                      <Icon className="h-2.5 w-2.5" style={{ color: meta.color }} />
                      {nodeTypeLabel(t, type)}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-[10px] text-muted-foreground">
          {t("codegraph", "unified.listHint", { count: nodes.length })}
          {nodes.length !== totalCount && ` / ${totalCount}`}
        </p>
      </div>

      {/* List (windowed) */}
      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto">
        {nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <div className="text-center">
              <Network className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <p className="mt-1.5 text-xs text-muted-foreground">{t("codegraph", "unified.empty")}</p>
            </div>
          </div>
        ) : (
          <ul className="py-1" role="listbox">
            {useWindowing && startIdx > 0 && <li aria-hidden style={{ height: startIdx * rowH }} />}
            {slice.map((n) => {
              const meta = getTypeMeta(n.type);
              const Icon = meta.icon;
              const isSel = selected === n.id;
              const deg = degreeMap.get(n.id) || 0;
              const isCyclic = !!n.metadata?.circular;
              return (
                <li key={n.id} role="option" aria-selected={isSel}>
                  <button
                    onClick={() => onSelect(n)}
                    className={cn(
                      "flex w-full items-center gap-2 border-l-2 px-2.5 text-left transition",
                      scaleCfg.list,
                      isSel
                        ? "border-cyan-400 bg-cyan-500/[0.08] text-cyan-100"
                        : "border-transparent hover:bg-white/[0.03] hover:text-foreground",
                    )}
                    style={{ height: rowH }}
                    title={n.filePath || n.id}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: meta.color }} />
                    <span className={cn("min-w-0 flex-1 truncate font-mono", isSel ? "text-cyan-100" : "text-foreground/90")}>
                      {n.label}
                    </span>
                    {isCyclic && (
                      <span className="shrink-0 rounded-full bg-red-500/15 px-1 text-[9px] font-bold text-red-300" title={t("codegraph", "unified.toggleCycles")}>⟳</span>
                    )}
                    {deg > 0 && <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">{deg}</span>}
                  </button>
                </li>
              );
            })}
            {useWindowing && endIdx < nodes.length && <li aria-hidden style={{ height: (nodes.length - endIdx) * rowH }} />}
          </ul>
        )}
      </div>

      {stats && (
        <div className="border-t border-white/5 p-2.5 text-[10px] text-muted-foreground">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <span><span className="text-foreground/80 tabular-nums">{stats.totalNodes}</span> {t("codegraph", "totalNodes").toLowerCase()}</span>
            <span><span className="text-foreground/80 tabular-nums">{stats.totalEdges}</span> {t("codegraph", "totalEdges").toLowerCase()}</span>
            <span><span className="text-foreground/80 tabular-nums">{stats.circularDeps.length}</span> {t("codegraph", "depGraph.circularDeps").toLowerCase()}</span>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

/* ───────────────────────── Detail Panel (right) ───────────────────────── */

function DetailPanel({
  inspector, nodeById, degreeMap, onSelect, fontScale,
  impact, impactLoading, impactError, onRunImpact, stats,
}: {
  inspector: InspectorData | null; nodeById: Map<string, GraphNode>;
  degreeMap: Map<string, number>; onSelect: (n: GraphNode) => void;
  fontScale: FontScale;
  impact: { count: number; depth: number; sample: GraphNode[] } | null;
  impactLoading: boolean; impactError: string | null; onRunImpact: () => void;
  stats: GraphStats | null;
}) {
  const { t } = useT();
  const scaleCfg = FONT_SCALE_CLASS[fontScale];

  return (
    <GlassCard className="flex h-[600px] flex-col overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
        <Network className="h-4 w-4 text-cyan-300" />
        <h3 className="text-sm font-semibold"><GradientText>{t("codegraph", "unified.detail")}</GradientText></h3>
      </div>

      <div className={cn("scrollbar-thin flex-1 overflow-y-auto p-4", scaleCfg.detail)}>
        <AnimatePresence mode="wait">
          {inspector ? (
            <motion.div
              key={inspector.node.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
              className="space-y-4"
            >
              <NodeHeader node={inspector.node} degree={degreeMap.get(inspector.node.id) || 0} />

              <div className="grid grid-cols-2 gap-2 text-xs">
                <MetaTile label={t("codegraph", "type")} value={nodeTypeLabel(t, inspector.node.type)} />
                <MetaTile label={t("codegraph", "degree")} value={String(degreeMap.get(inspector.node.id) || 0)} />
                {inspector.node.metadata.linesOfCode != null && (
                  <MetaTile label={t("codegraph", "lines")} value={String(inspector.node.metadata.linesOfCode)} />
                )}
                {inspector.node.metadata.complexity != null && (
                  <MetaTile label={t("codegraph", "complexity")} value={String(inspector.node.metadata.complexity)} />
                )}
                {inspector.node.language && (
                  <MetaTile label={t("codegraph", "language")} value={inspector.node.language} />
                )}
              </div>

              {(inspector.node.metadata as any).description && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {(inspector.node.metadata as any).description}
                </p>
              )}

              {/* Impact analysis */}
              <div className="rounded-lg border border-amber-400/15 bg-amber-500/[0.03] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-3.5 w-3.5 text-amber-300" />
                    <span className="text-xs font-medium text-amber-200">{t("codegraph", "unified.impactAnalysis")}</span>
                  </div>
                  <Button
                    size="sm" variant="ghost" onClick={onRunImpact} disabled={impactLoading}
                    className="h-7 gap-1 border border-amber-400/30 bg-amber-500/10 px-2 text-[11px] text-amber-200 hover:bg-amber-500/20"
                  >
                    {impactLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    {impactLoading ? t("codegraph", "unified.impactLoading") : t("codegraph", "unified.impactAnalysis")}
                  </Button>
                </div>
                {impactError && <p className="mt-2 text-[11px] text-red-300">{impactError}</p>}
                {impact && !impactError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="mt-2 overflow-hidden"
                  >
                    {impact.count > 0 ? (
                      <>
                        <p className="text-[11px] leading-relaxed text-amber-100/90">
                          {t("codegraph", "unified.impactResult", { count: impact.count, depth: impact.depth })}
                        </p>
                        {impact.sample.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5">
                            {impact.sample.map((n) => (
                              <li key={n.id}>
                                <button
                                  onClick={() => onSelect(n)}
                                  className="flex items-center gap-1.5 text-left text-[10px] text-foreground/80 hover:text-cyan-200"
                                >
                                  <ArrowLeft className="h-2.5 w-2.5 shrink-0 text-amber-400/70" />
                                  <span className="truncate font-mono">{n.label}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <p className="text-[11px] leading-relaxed text-emerald-200/80">
                        {t("codegraph", "unified.impactEmpty")}
                      </p>
                    )}
                  </motion.div>
                )}
              </div>

              <EdgeList
                title={t("codegraph", "unified.incoming")} edges={inspector.incoming}
                direction="in" nodeById={nodeById} onSelect={onSelect} emptyText={t("codegraph", "none")}
              />
              <EdgeList
                title={t("codegraph", "unified.outgoing")} edges={inspector.outgoing}
                direction="out" nodeById={nodeById} onSelect={onSelect} emptyText={t("codegraph", "none")}
              />

              {stats && (
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("codegraph", "graphStats")}
                  </p>
                  <div className="space-y-0.5 text-[11px]">
                    {Object.entries(stats.byNodeType).slice(0, 6).map(([type, count]) => {
                      const meta = getTypeMeta(type);
                      return (
                        <div key={type} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                            {nodeTypeLabel(t, type)}
                          </span>
                          <span className="tabular-nums">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center text-center"
            >
              <Network className="h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 max-w-[240px] text-xs text-muted-foreground">
                {t("codegraph", "unified.noSelection")}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlassCard>
  );
}

function NodeHeader({ node, degree }: { node: GraphNode; degree: number }) {
  const meta = getTypeMeta(node.type);
  const Icon = meta.icon;
  return (
    <div className="flex items-start gap-2.5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
        style={{ background: `${meta.color}1a`, color: meta.color }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm font-semibold text-cyan-100">{node.label}</p>
        <p className="truncate text-[11px] text-muted-foreground">{node.filePath || node.id}</p>
        {node.metadata?.circular && (
          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
            <AlertTriangle className="h-2.5 w-2.5" /> circular
          </span>
        )}
      </div>
      <Badge variant="outline" className="shrink-0 border-white/10 text-[10px] tabular-nums">deg {degree}</Badge>
    </div>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] p-2">
      <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}

function EdgeList({
  title, edges, direction, nodeById, onSelect, emptyText,
}: {
  title: string; edges: GraphEdge[]; direction: "in" | "out";
  nodeById: Map<string, GraphNode>; onSelect: (n: GraphNode) => void; emptyText: string;
}) {
  const { t } = useT();
  // Initial state applies on each fresh mount (parent wraps in a keyed
  // AnimatePresence, so selecting a different node remounts this component).
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? edges : edges.slice(0, 10);
  const Icon = direction === "in" ? ArrowLeft : ArrowRight;
  const accent = direction === "in" ? "text-cyan-300" : "text-violet-300";

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02]">
      <button
        onClick={() => setExpanded((s) => !s)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <ChevronDown className={cn("h-3 w-3 transition", !expanded && "-rotate-90")} />
          {title} ({edges.length})
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="overflow-hidden"
          >
            <ul className="max-h-44 space-y-0.5 overflow-y-auto px-2 pb-2 scrollbar-thin">
              {edges.length === 0 && <li className="px-2 py-1 text-[11px] text-muted-foreground">{emptyText}</li>}
              {visible.map((e, i) => {
                const otherId = direction === "in" ? e.from : e.to;
                const other = nodeById.get(otherId);
                if (!other) return null;
                const meta = getTypeMeta(other.type);
                const OtherIcon = meta.icon;
                const color = EDGE_COLORS[e.type] || "#475569";
                return (
                  <li key={`${e.from}-${e.to}-${e.type}-${i}`}>
                    <button
                      onClick={() => onSelect(other)}
                      className="flex w-full items-center gap-1.5 rounded p-1.5 text-left text-[11px] hover:bg-white/[0.04]"
                    >
                      <Icon className={cn("h-3 w-3 shrink-0", accent)} />
                      <OtherIcon className="h-3 w-3 shrink-0" style={{ color: meta.color }} />
                      <span className="min-w-0 flex-1 truncate font-mono">{other.label}</span>
                      <span
                        className="shrink-0 rounded px-1 text-[9px] font-medium"
                        style={{ background: `${color}1a`, color }}
                      >
                        {edgeTypeLabel(t, e.type)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {edges.length > 10 && (
              <button
                onClick={() => setShowAll((s) => !s)}
                className="w-full border-t border-white/5 py-1.5 text-center text-[10px] text-cyan-300 hover:bg-white/[0.03]"
              >
                {showAll ? t("codegraph", "unified.collapse") : t("codegraph", "unified.showAll", { count: edges.length })}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────────────────────── Graph type selector ───────────────────────── */

function GraphTypeSelector({ graphType, onChange }: { graphType: GraphType; onChange: (t: GraphType) => void }) {
  const { t } = useT();
  return (
    <GlassCard className="p-3">
      <div className="flex flex-wrap gap-1.5">
        {ALL_GRAPH_TYPES.map((meta) => {
          const active = graphType === meta.type;
          const label = labelOrKey(t, "codegraph", `unified.types.${meta.type}`, meta.label);
          const desc = labelOrKey(t, "codegraph", `unified.descriptions.${meta.type}`, meta.description);
          return (
            <button
              key={meta.type} onClick={() => onChange(meta.type)} title={desc}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition",
                active
                  ? "border-cyan-400/40 bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-cyan-200"
                  : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
              )}
            >
              <span className="text-sm">{meta.icon}</span>
              {label}
            </button>
          );
        })}
      </div>
    </GlassCard>
  );
}
