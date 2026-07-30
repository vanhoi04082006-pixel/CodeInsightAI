"use client";

// UnifiedCodeGraph — single-component graph explorer that replaces the
// previous "Dependencies" + "CodeGraph" tabs.
//
// Layout:
//   ┌──────────────────────────────────────────────────────────────┐
//   │  Graph Type selector (6 buttons — ALL_GRAPH_TYPES catalog)   │
//   ├──────────────────────────────────────────────────────────────┤
//   │  AI Analysis card (lazy-loaded; sessionStorage per type)     │
//   ├───────────────────────────────────────┬──────────────────────┤
//   │  D3-force canvas                       │  Inspector          │
//   │  - search box + stats badge            │  Stats panel        │
//   │  - zoom controls                       │                     │
//   │  - legend (node + edge colors)         │                     │
//   ├───────────────────────────────────────┴──────────────────────┤
//   │  Dead Code  |  Duplicate Code  (report.deadCode + duplicates │
//   │                                  + deep.duplicateAnalysis)  │
//   └──────────────────────────────────────────────────────────────┘
//
// Data flow:
//   - graphType state → fetch /api/graph/[analysisId]?type=X&q=full
//     → { nodes, edges, stats, aiConfig }
//   - node click → fetch ?type=X&q=inspector&node=ID
//   - AI button → POST /api/chat with aiConfig.prompt + serialized
//     stats/top/cycles; persisted in sessionStorage keyed per
//     analysisId + graphType so switching types preserves each result.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import * as d3 from "d3-force";
import {
  Search, ZoomIn, ZoomOut, Maximize, Network, Loader2, ChevronRight,
  Filter, FileCode, Zap, Database, Route as RouteIcon,
  Package, Box, Sparkles, AlertTriangle, Copy, AlertCircle,
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

/* ───────────────────────── Rendering constants ───────────────────────── */

// Local GraphNode carries the d3 simulation position fields. We keep this
// distinct from the engine's GraphNode so the engine types stay I/O-free.
interface SimNode extends d3.SimulationNodeDatum, GraphNode {}

const GROUP_COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#fb923c"];
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
  imports: "#67e8f9",
  calls: "#a78bfa",
  extends: "#f472b6",
  implements: "#34d399",
  uses: "#fbbf24",
  depends_on: "#475569",
  exports: "#60a5fa",
};

function nodeRadius(degree: number, type: string): number {
  const base: Record<string, number> = { file: 8, function: 7, class: 8, module: 10, route: 7, component: 7, import: 6 };
  const b = base[type] ?? 7;
  return Math.max(6, Math.min(16, b + Math.sqrt(degree) * 0.8));
}

/** Maximum label width before truncation (in SVG units). */
const MAX_LABEL_WIDTH = 60;
/** Vertical gap between node circle bottom and label top. */
const LABEL_GAP = 5;
/** Label font size in SVG units (scales with zoom). */
const LABEL_FONT_SIZE = 6;
/** Label font size when zoomed in or hovered. */
const LABEL_FONT_SIZE_LARGE = 8;

/* ───────────────────────── Component ───────────────────────── */

export function UnifiedCodeGraph({
  analysisId,
  report,
}: {
  analysisId: string | null;
  report: AnalysisReport;
}) {
  const { t } = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const minimapRef = useRef<SVGSVGElement>(null);

  const [graphType, setGraphType] = useState<GraphType>("dependencies");

  // Graph payload — populated from /api/graph/[analysisId]?type=X&q=full
  const [allNodes, setAllNodes] = useState<SimNode[]>([]);
  const [allEdges, setAllEdges] = useState<GraphEdge[]>([]);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [aiConfig, setAiConfig] = useState<GraphAIConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // View state
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState("");
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [degreeMap, setDegreeMap] = useState<Map<string, number>>(new Map());
  const [inspector, setInspector] = useState<InspectorData | null>(null);
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showCycles, setShowCycles] = useState(true);
  const [cyclicNodeIds, setCyclicNodeIds] = useState<Set<string>>(new Set());
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  /* ── AI insight state (per-graph-type sessionStorage cache) ── */
  const aiStorageKey = analysisId
    ? `unified-graph-ai-${analysisId}-${graphType}`
    : "";
  const [aiInsight, setAiInsight] = useState<string | null>(() => {
    if (!aiStorageKey || typeof window === "undefined") return null;
    try {
      return sessionStorage.getItem(aiStorageKey);
    } catch { return null; }
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiExpanded, setAiExpanded] = useState<boolean>(() => {
    if (!aiStorageKey || typeof window === "undefined") return false;
    try {
      return !!sessionStorage.getItem(aiStorageKey);
    } catch { return false; }
  });

  // Reset cached AI state when graph type changes — each type has its own
  // sessionStorage key, so we just rehydrate from the new key.
  useEffect(() => {
    if (!aiStorageKey || typeof window === "undefined") {
      setAiInsight(null);
      setAiExpanded(false);
      return;
    }
    try {
      const cached = sessionStorage.getItem(aiStorageKey);
      setAiInsight(cached);
      setAiExpanded(!!cached);
    } catch {
      setAiInsight(null);
      setAiExpanded(false);
    }
    setAiError(null);
  }, [aiStorageKey]);

  // Clear selection/inspector when switching types — the old inspector's
  // node id may not exist in the new graph.
  useEffect(() => {
    setSelected(null);
    setInspector(null);
    setSearch("");
  }, [graphType]);

  /* ── Fetch full graph data whenever analysisId or graphType changes ── */
  useEffect(() => {
    if (!analysisId) {
      setLoading(false);
      setAllNodes([]);
      setAllEdges([]);
      setStats(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const ctrl = new AbortController();
    fetch(`/api/graph/${analysisId}?type=${graphType}&q=full`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { nodes: GraphNode[]; edges: GraphEdge[]; stats: GraphStats; aiConfig: GraphAIConfig }) => {
        setAllNodes((data.nodes ?? []) as SimNode[]);
        setAllEdges(data.edges ?? []);
        setStats(data.stats ?? null);
        setAiConfig(data.aiConfig ?? null);

        // Compute degree + cyclic node set for sizing + highlighting.
        const deg = new Map<string, number>();
        data.nodes.forEach((n) => deg.set(n.id, 0));
        data.edges.forEach((e) => {
          deg.set(e.from, (deg.get(e.from) || 0) + 1);
          deg.set(e.to, (deg.get(e.to) || 0) + 1);
        });
        setDegreeMap(deg);

        const cyclic = new Set<string>();
        (data.stats?.circularDeps ?? []).forEach((cycle) => cycle.forEach((id) => cyclic.add(id)));
        // Also honor the per-node `circular` flag set by the dependency provider.
        data.nodes.forEach((n) => { if (n.metadata?.circular) cyclic.add(n.id); });
        setCyclicNodeIds(cyclic);

        // Initialize type filter with all node types present in this graph.
        const presentTypes = new Set(data.nodes.map((n) => n.type));
        setTypeFilter(presentTypes);

        // Run d3-force simulation once to compute initial positions.
        // Nodes with a precomputed layout (dependency provider sets x/y/size)
        // are pinned; the rest are positioned by the force simulation.
        if (data.nodes.length > 0) {
          const simNodes: SimNode[] = data.nodes.map((n) => ({ ...n }));
          const nodeById = new Map(simNodes.map((n) => [n.id, n]));
          const simLinks = (data.edges ?? [])
            .filter((e) => nodeById.has(e.from) && nodeById.has(e.to))
            .map((e) => ({
              source: nodeById.get(e.from)!,
              target: nodeById.get(e.to)!,
              weight: e.weight,
            }));

          const hasLayout = simNodes.some((n) => typeof n.metadata?.x === "number");
          const simulation = d3
            .forceSimulation<SimNode>(simNodes)
            .force(
              "link",
              d3.forceLink<SimNode, any>(simLinks).id((d) => d.id).distance(60).strength(0.1),
            )
            .force("charge", d3.forceManyBody().strength(-80))
            .force("center", d3.forceCenter(300, 250))
            .force(
              "collide",
              d3.forceCollide<SimNode>().radius((d) => nodeRadius(deg.get(d.id) || 0, d.type) + 8),
            )
            .alphaDecay(0.02);

          if (hasLayout) {
            // Pin pre-laid-out nodes (dependency graph) — they already have x/y.
            simNodes.forEach((n) => {
              if (typeof n.metadata?.x === "number" && typeof n.metadata?.y === "number") {
                n.fx = n.metadata.x;
                n.fy = n.metadata.y;
                n.x = n.metadata.x;
                n.y = n.metadata.y;
              }
            });
            simulation.alpha(0.3).restart();
          }

          simulation.on("tick", () => {
            const next = new Map<string, { x: number; y: number }>();
            simNodes.forEach((n) => next.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 }));
            setPositions(next);
          });
          setTimeout(() => simulation.stop(), 1500);
        }
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setLoadError(e?.message || "Failed to load graph");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [analysisId, graphType]);

  const getPos = (id: string) => positions.get(id) ?? { x: 150, y: 125 };

  /* ── Filtered nodes (search + type filter) ── */
  const visibleNodes = useMemo(() => {
    let filtered = allNodes;
    if (typeFilter.size < new Set(allNodes.map((n) => n.type)).size) {
      filtered = filtered.filter((n) => typeFilter.has(n.type));
    }
    if (search) {
      const l = search.toLowerCase();
      filtered = filtered.filter(
        (n) =>
          n.label.toLowerCase().includes(l) ||
          (n.filePath?.toLowerCase().includes(l) ?? false) ||
          n.id.toLowerCase().includes(l),
      );
    }
    return filtered;
  }, [allNodes, typeFilter, search]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => allEdges.filter((e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to)),
    [allEdges, visibleNodeIds],
  );

  // Connected (neighbors) of the currently-selected node — for highlight.
  const connected = useMemo(() => {
    const set = new Set<string>();
    if (selected) {
      allEdges.forEach((e) => {
        if (e.from === selected) set.add(e.to);
        if (e.to === selected) set.add(e.from);
      });
    }
    return set;
  }, [selected, allEdges]);

  /* ── Pan / zoom handlers ── */
  const onDown = (e: React.MouseEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      setPan({
        x: drag.current.px + (e.clientX - drag.current.x),
        y: drag.current.py + (e.clientY - drag.current.y),
      });
    };
    const onUp = () => { drag.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [pan]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.max(0.3, Math.min(4, z + delta)));
  };

  const fitToScreen = () => {
    if (allNodes.length === 0) return;
    const pts = allNodes.map((n) => getPos(n.id)).filter((p) => p.x || p.y);
    if (pts.length === 0) return;
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const gw = maxX - minX || 600;
    const gh = maxY - minY || 500;
    const newZoom = Math.min(600 / (gw + 40), 500 / (gh + 40), 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setZoom(newZoom);
    setPan({ x: (300 - cx * newZoom) * 3, y: (250 - cy * newZoom) * 3 });
  };

  /* ── Inspector fetch (lazy on node click) ── */
  const handleNodeClick = (node: GraphNode) => {
    setSelected(node.id);
    if (!analysisId) {
      setInspector({ node, incoming: [], outgoing: [], neighbors: [] });
      return;
    }
    fetch(`/api/graph/${analysisId}?type=${graphType}&q=inspector&node=${encodeURIComponent(node.id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.inspector) setInspector(data.inspector);
        else setInspector({ node, incoming: [], outgoing: [], neighbors: [] });
      })
      .catch(() => setInspector({ node, incoming: [], outgoing: [], neighbors: [] }));
  };

  const toggleTypeFilter = (type: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  /* ── AI Analysis: call /api/chat with the type-specific prompt + ──
     serialized stats/top/cycles context. Persisted per-type in
     sessionStorage so switching tabs/types doesn't re-run the AI.       */
  const runAiInsight = async () => {
    if (!analysisId || aiLoading || !aiConfig) return;
    setAiLoading(true);
    setAiError(null);
    setAiExpanded(true);

    // Serialize a compact context payload (top nodes, cycles, stats).
    const topNodesByDegree: Array<{ id: string; label: string; type: string; degree: number }> = [];
    const degreeEntries = [...degreeMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [id, deg] of degreeEntries) {
      const n = allNodes.find((x) => x.id === id);
      if (n) topNodesByDegree.push({ id, label: n.label, type: n.type, degree: deg });
    }
    const cycles = stats?.circularDeps ?? [];
    const contextBlock = [
      `Graph type: ${graphType}`,
      stats ? `Stats: ${stats.totalNodes} nodes · ${stats.totalEdges} edges · avg connectivity ${stats.avgConnectivity}` : "",
      stats && stats.byNodeType ? `By node type: ${JSON.stringify(stats.byNodeType)}` : "",
      stats && stats.byEdgeType ? `By edge type: ${JSON.stringify(stats.byEdgeType)}` : "",
      cycles.length > 0 ? `Circular dependencies (${cycles.length}): ${cycles.slice(0, 5).map((c) => c.join("→")).join(" | ")}` : "No circular dependencies detected.",
      topNodesByDegree.length > 0
        ? `Top nodes by degree:\n${topNodesByDegree.map((n) => `- ${n.label} [${n.type}] — degree ${n.degree}`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n");

    const userMessage = `${aiConfig.prompt}\n\n--- GRAPH CONTEXT ---\n${contextBlock}\n\nProvide concrete, actionable findings. Cite specific node labels. Respond in plain text (markdown OK).`;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          language: useI18nStore.getState().locale,
        }),
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

  /* ── Dead code / duplicate code (from report) ── */
  const deep = (report as any).deepAnalysis as any;
  const aiDuplicates: any[] | undefined = deep?.duplicateAnalysis;
  const aiPassesCompleted: string[] = (report as any)._aiPassesCompleted || [];
  const aiStatus = (report as any).aiStatus;
  const dupPassFailed =
    (aiStatus === "done" || aiStatus === "pending") &&
    !aiPassesCompleted.includes("duplicates") &&
    (!aiDuplicates || aiDuplicates.length === 0);
  const dupPassPending = aiStatus === "pending" && !aiPassesCompleted.includes("duplicates");

  /* ── Render ── */
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

  const presentTypes = Array.from(new Set(allNodes.map((n) => n.type)));

  return (
    <div className="space-y-4">
      {/* Graph type selector — 6 buttons */}
      <GraphTypeSelector graphType={graphType} onChange={setGraphType} />

      {/* AI Analysis card — lazy on click, persisted per-type in sessionStorage */}
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
            size="sm"
            variant="ghost"
            onClick={runAiInsight}
            disabled={aiLoading || !analysisId}
            className="h-8 gap-1.5 border border-violet-400/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 hover:text-violet-100"
          >
            {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {t("codegraph", "aiInsight.button")}
          </Button>
        </div>

        {aiExpanded && (aiLoading || aiError || aiInsight) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-3 overflow-hidden"
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
      </GlassCard>

      {/* Canvas + Inspector */}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <GlassCard className="relative overflow-hidden">
          {/* Top bar: search + stats + filter toggle */}
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("codegraph", "searchNodes")}
                className="h-8 w-48 pl-8 text-xs bg-white/[0.03]"
              />
            </div>
            {stats && (
              <Badge variant="outline" className="text-[10px]">
                {t("codegraph", "badgeStats", {
                  vn: visibleNodes.length,
                  tn: stats.totalNodes,
                  ve: visibleEdges.length,
                  te: stats.totalEdges,
                })}
              </Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowFilters((s) => !s)}
              className={cn("h-8 px-2", showFilters && "bg-white/10")}
              title={t("codegraph", "filterByType")}
            >
              <Filter className="h-3.5 w-3.5" />
            </Button>
            {cyclicNodeIds.size > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowCycles((s) => !s)}
                className={cn("h-8 px-2", showCycles && "bg-red-500/15 text-red-300")}
                title={t("codegraph", "unified.toggleCycles")}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Filter panel */}
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute left-3 top-14 z-10 rounded-lg border border-white/10 bg-black/60 p-2 backdrop-blur-md"
            >
              <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{t("codegraph", "filterByType")}</p>
              <div className="grid grid-cols-2 gap-1">
                {presentTypes.map((type) => {
                  const meta = TYPE_META[type] || { icon: Network, color: "#94a3b8" };
                  const Icon = meta.icon;
                  const active = typeFilter.has(type);
                  const count = allNodes.filter((n) => n.type === type).length;
                  return (
                    <button
                      key={type}
                      onClick={() => toggleTypeFilter(type)}
                      className={cn(
                        "flex items-center gap-1.5 rounded px-2 py-1 text-[10px] transition",
                        active ? "bg-white/10 text-foreground" : "text-muted-foreground opacity-50",
                      )}
                    >
                      <Icon className="h-3 w-3" style={{ color: meta.color }} />
                      {t("codegraph", `nodeTypes.${type}`) !== `nodeTypes.${type}` ? t("codegraph", `nodeTypes.${type}`) : type} ({count})
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Zoom controls */}
          <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
            <button onClick={() => setZoom((z) => Math.min(4, z + 0.2))} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-sm hover:bg-white/10"><ZoomIn className="h-3.5 w-3.5" /></button>
            <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-sm hover:bg-white/10"><ZoomOut className="h-3.5 w-3.5" /></button>
            <button onClick={fitToScreen} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-xs hover:bg-white/10" title={t("codegraph", "fitToScreen")}><Maximize className="h-3.5 w-3.5" /></button>
          </div>

          {/* Legend (node types) */}
          <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-2 rounded-lg border border-white/10 bg-black/40 p-2 backdrop-blur-md">
            {presentTypes.slice(0, 6).map((type) => {
              const meta = TYPE_META[type] || { color: "#94a3b8" };
              const label = t("codegraph", `nodeTypes.${type}`) !== `nodeTypes.${type}` ? t("codegraph", `nodeTypes.${type}`) : type;
              return (
                <span key={type} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                  {label}
                </span>
              );
            })}
          </div>

          {/* Legend (edge types) */}
          <div className="absolute bottom-3 right-3 z-10 flex flex-wrap gap-2 rounded-lg border border-white/10 bg-black/40 p-2 backdrop-blur-md">
            {Array.from(new Set(allEdges.map((e) => e.type))).slice(0, 4).map((edgeType) => (
              <span key={edgeType} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-0.5 w-3" style={{ background: EDGE_COLORS[edgeType] || "#475569" }} />
                {t("codegraph", `edgeTypes.${edgeType}`) !== `edgeTypes.${edgeType}` ? t("codegraph", `edgeTypes.${edgeType}`) : edgeType}
              </span>
            ))}
          </div>

          {/* SVG graph */}
          {allNodes.length === 0 ? (
            <div className="flex h-[500px] items-center justify-center">
              <div className="text-center">
                <Network className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">{t("codegraph", "unified.empty")}</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {ALL_GRAPH_TYPES.find((g) => g.type === graphType)?.description}
                </p>
              </div>
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox="0 0 600 500"
              className="h-[500px] w-full cursor-grab active:cursor-grabbing"
              onMouseDown={onDown}
              onWheel={onWheel}
              style={{ touchAction: "none" }}
            >
              <defs>
                {GROUP_COLORS.map((c, i) => (
                  <radialGradient key={i} id={`ucg-grad-${i}`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={c} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={c} stopOpacity={0.4} />
                  </radialGradient>
                ))}
                {Object.entries(EDGE_COLORS).map(([type, color]) => (
                  <marker key={type} id={`ucg-arrow-${type}`} viewBox="0 0 10 10" refX="10" refY="5"
                    markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={color} opacity="0.6" />
                  </marker>
                ))}
              </defs>

              <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`} style={{ transformOrigin: "0 0", transition: "transform 0.1s ease-out" }}>
                {/* Edges */}
                {visibleEdges.map((e, i) => {
                  const a = getPos(e.from); const b = getPos(e.to);
                  if (!a.x && !a.y && !b.x && !b.y) return null;
                  const dim = (selected && selected !== e.from && selected !== e.to) || (hovered && hovered !== e.from && hovered !== e.to);
                  const color = EDGE_COLORS[e.type] || "#475569";
                  const dx = b.x - a.x; const dy = b.y - a.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  if (dist < 1) return null;
                  const fromNode = allNodes.find((n) => n.id === e.from);
                  const toNode = allNodes.find((n) => n.id === e.to);
                  const ra = nodeRadius(degreeMap.get(e.from) || 0, fromNode?.type ?? "file");
                  const rb = nodeRadius(degreeMap.get(e.to) || 0, toNode?.type ?? "file");
                  const x1 = a.x + (dx / dist) * ra;
                  const y1 = a.y + (dy / dist) * ra;
                  const x2 = b.x - (dx / dist) * (rb + 3);
                  const y2 = b.y - (dy / dist) * (rb + 3);
                  const isCircular = e.metadata?.circular || (cyclicNodeIds.has(e.from) && cyclicNodeIds.has(e.to));
                  return (
                    <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={isCircular && showCycles ? "#ef4444" : color}
                      strokeWidth={isCircular ? 1 : 0.6}
                      strokeOpacity={dim ? 0.05 : isCircular ? 0.6 : 0.3}
                      strokeDasharray={e.type === "depends_on" ? "2 2" : isCircular ? "1 1" : undefined}
                      markerEnd={`url(#ucg-arrow-${e.type})`}
                    />
                  );
                })}

                {/* Nodes */}
                {visibleNodes.map((n) => {
                  const pos = getPos(n.id);
                  const isHover = hovered === n.id;
                  const isSel = selected === n.id;
                  const isConn = connected.has(n.id);
                  const dim = (selected && !isSel && !isConn) || (hovered && !isHover && !isConn && hovered !== n.id);
                  const degree = degreeMap.get(n.id) || 0;
                  const r = nodeRadius(degree, n.type);
                  const meta = TYPE_META[n.type] || { color: "#94a3b8", icon: Network };
                  const color = meta.color;
                  const isCyclic = showCycles && cyclicNodeIds.has(n.id);
                  const isSearchMatch = !!(search && (
                    n.label.toLowerCase().includes(search.toLowerCase()) ||
                    (n.filePath?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
                    n.id.toLowerCase().includes(search.toLowerCase())
                  ));
                  // Label visibility: always show for small graphs, hover/select for large
                  const showLabel = isHover || isSel || isSearchMatch || zoom > 1.5 || visibleNodes.length <= 50;
                  const fontSize = (isHover || isSel || zoom > 2) ? LABEL_FONT_SIZE_LARGE : LABEL_FONT_SIZE;
                  // Truncate label if too long
                  const maxChars = Math.floor(MAX_LABEL_WIDTH / (fontSize * 0.55));
                  const displayLabel = n.label.length > maxChars ? n.label.slice(0, maxChars - 1) + "…" : n.label;
                  // Label Y position: below the circle with a clear gap
                  const labelY = pos.y + r + LABEL_GAP + fontSize;
                  // Background rect for label (improves readability over edges)
                  const labelBgWidth = displayLabel.length * fontSize * 0.6 + 4;
                  const labelBgHeight = fontSize + 2;
                  const labelBgX = pos.x - labelBgWidth / 2;
                  const labelBgY = labelY - fontSize;
                  return (
                    <g key={n.id}
                      onMouseEnter={() => setHovered(n.id)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => handleNodeClick(n)}
                      style={{ cursor: "pointer", opacity: dim ? 0.15 : 1, transition: "opacity 0.2s" }}
                    >
                      {/* Glow halo for hover/select/search */}
                      {(isHover || isSel || isSearchMatch) && (
                        <circle cx={pos.x} cy={pos.y} r={r + 5} fill={color} opacity={0.15} />
                      )}
                      {/* Search match ring */}
                      {isSearchMatch && (
                        <circle cx={pos.x} cy={pos.y} r={r + 3} fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="2 1" />
                      )}
                      {/* Cyclic dependency ring */}
                      {isCyclic && (
                        <circle cx={pos.x} cy={pos.y} r={r + 3} fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="1 1" />
                      )}
                      {/* Main node circle */}
                      <circle cx={pos.x} cy={pos.y} r={r}
                        fill={color}
                        fillOpacity={0.7}
                        stroke={isCyclic ? "#ef4444" : isSel ? "#ffffff" : color}
                        strokeWidth={isSel ? 2 : isCyclic ? 1 : 0.5}
                      />
                      {/* Inner dot (white center for visual depth) */}
                      <circle cx={pos.x} cy={pos.y} r={r * 0.35} fill="white" opacity={isHover || isSel ? 0.9 : 0.4} className="pointer-events-none" />

                      {/* Label — ALWAYS below the node with clear gap, never overlapping */}
                      {showLabel && (
                        <>
                          {/* Label background for readability */}
                          <rect
                            x={labelBgX} y={labelBgY}
                            width={labelBgWidth} height={labelBgHeight}
                            rx={2}
                            fill="rgba(0,0,0,0.75)"
                            className="pointer-events-none"
                          />
                          <text
                            x={pos.x}
                            y={labelY}
                            textAnchor="middle"
                            fontSize={fontSize}
                            fill={isSel ? "#22d3ee" : isSearchMatch ? "#fbbf24" : "#e2e8f0"}
                            className="font-mono pointer-events-none font-medium"
                            style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.5)", strokeWidth: 0.5 }}
                          >
                            {displayLabel}
                          </text>
                        </>
                      )}

                      {/* Degree badge — top-right of node, separate from label */}
                      {degree > 5 && (isHover || isSel || zoom > 1.5) && (
                        <g className="pointer-events-none">
                          <circle cx={pos.x + r + 2} cy={pos.y - r - 2} r={3} fill="#1e293b" stroke={color} strokeWidth="0.5" />
                          <text x={pos.x + r + 2} y={pos.y - r - 0.5} textAnchor="middle" fontSize="4" fill={color} className="font-bold">
                            {degree}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          {/* Minimap */}
          {allNodes.length > 0 && (
            <div className="absolute bottom-3 right-24 z-10 hidden rounded-lg border border-white/10 bg-black/60 p-1 backdrop-blur-md sm:block">
              <svg ref={minimapRef} viewBox="0 0 600 500" className="h-20 w-24">
                {allNodes.slice(0, 200).map((n) => {
                  const pos = getPos(n.id);
                  const meta = TYPE_META[n.type] || { color: "#94a3b8" };
                  return <circle key={n.id} cx={pos.x} cy={pos.y} r="1.5" fill={meta.color} opacity={0.5} />;
                })}
                <rect
                  x={-pan.x / zoom} y={-pan.y / zoom}
                  width={600 / zoom} height={500 / zoom}
                  fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.6"
                />
              </svg>
              <p className="mt-0.5 text-center text-[8px] text-muted-foreground">{t("codegraph", "minimap")}</p>
            </div>
          )}
        </GlassCard>

        {/* Right column: Inspector + Stats */}
        <div className="space-y-3">
          <GlassCard className="p-4">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-cyan-300" />
              <h3 className="text-sm font-semibold"><GradientText>{t("codegraph", "inspector")}</GradientText></h3>
            </div>
            {inspector ? (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  {(() => {
                    const meta = TYPE_META[inspector.node.type] || { icon: Network, color: "#94a3b8" };
                    const Icon = meta.icon;
                    return <Icon className="h-4 w-4" style={{ color: meta.color }} />;
                  })()}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm text-cyan-300">{inspector.node.label}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{inspector.node.filePath || inspector.node.id}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded border border-white/5 bg-white/[0.02] p-2">
                    <span className="text-muted-foreground">{t("codegraph", "type")}</span>
                    <p className="font-medium capitalize">{inspector.node.type}</p>
                  </div>
                  <div className="rounded border border-white/5 bg-white/[0.02] p-2">
                    <span className="text-muted-foreground">{t("codegraph", "degree")}</span>
                    <p className="font-medium tabular-nums">{degreeMap.get(inspector.node.id) || 0}</p>
                  </div>
                  {inspector.node.metadata.linesOfCode != null && (
                    <div className="rounded border border-white/5 bg-white/[0.02] p-2">
                      <span className="text-muted-foreground">{t("codegraph", "lines")}</span>
                      <p className="font-medium tabular-nums">{inspector.node.metadata.linesOfCode}</p>
                    </div>
                  )}
                  {inspector.node.metadata.complexity != null && (
                    <div className="rounded border border-white/5 bg-white/[0.02] p-2">
                      <span className="text-muted-foreground">{t("codegraph", "complexity")}</span>
                      <p className="font-medium tabular-nums">{inspector.node.metadata.complexity}</p>
                    </div>
                  )}
                </div>
                {(inspector.node.metadata as any).description && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{(inspector.node.metadata as any).description}</p>
                )}
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("codegraph", "incoming")} ({inspector.incoming.length})</p>
                  <div className="max-h-24 space-y-0.5 overflow-y-auto scrollbar-thin">
                    {inspector.incoming.slice(0, 10).map((e) => {
                      const from = allNodes.find((n) => n.id === e.from);
                      if (!from) return null;
                      return (
                        <button key={`${e.from}-${e.to}-${e.type}`} onClick={() => handleNodeClick(from)} className="flex w-full items-center gap-1 rounded p-1 text-left text-[10px] hover:bg-white/5">
                          <ChevronRight className="h-2.5 w-2.5 shrink-0 text-cyan-300" />
                          <span className="truncate font-mono">{from.label}</span>
                        </button>
                      );
                    })}
                    {inspector.incoming.length === 0 && <p className="text-[10px] text-muted-foreground">{t("codegraph", "none")}</p>}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("codegraph", "outgoing")} ({inspector.outgoing.length})</p>
                  <div className="max-h-24 space-y-0.5 overflow-y-auto scrollbar-thin">
                    {inspector.outgoing.slice(0, 10).map((e) => {
                      const to = allNodes.find((n) => n.id === e.to);
                      if (!to) return null;
                      return (
                        <button key={`${e.from}-${e.to}-${e.type}`} onClick={() => handleNodeClick(to)} className="flex w-full items-center gap-1 rounded p-1 text-left text-[10px] hover:bg-white/5">
                          <ChevronRight className="h-2.5 w-2.5 shrink-0 text-violet-300" />
                          <span className="truncate font-mono">{to.label}</span>
                        </button>
                      );
                    })}
                    {inspector.outgoing.length === 0 && <p className="text-[10px] text-muted-foreground">{t("codegraph", "none")}</p>}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">{t("codegraph", "clickToInspect")}</p>
            )}
          </GlassCard>

          {stats && (
            <GlassCard className="p-4">
              <h3 className="text-sm font-semibold">{t("codegraph", "graphStats")}</h3>
              <div className="mt-2 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">{t("codegraph", "totalNodes")}</span><span className="font-medium tabular-nums">{stats.totalNodes}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("codegraph", "totalEdges")}</span><span className="font-medium tabular-nums">{stats.totalEdges}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("codegraph", "depGraph.avgConnectivity")}</span><span className="font-medium tabular-nums">{stats.avgConnectivity.toFixed(1)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("codegraph", "depGraph.circularDeps")}</span><span className="font-medium tabular-nums">{stats.circularDeps.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("codegraph", "visible")}</span><span className="font-medium tabular-nums">{visibleNodes.length} / {visibleEdges.length}</span></div>
                {Object.entries(stats.byNodeType).map(([type, count]) => {
                  const meta = TYPE_META[type];
                  return (
                    <div key={type} className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        {meta && <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />}
                        {meta ? (t("codegraph", `nodeTypes.${type}`) !== `nodeTypes.${type}` ? t("codegraph", `nodeTypes.${type}`) : type) : type}
                      </span>
                      <span className="font-medium tabular-nums">{count}</span>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {/* Dead Code + Duplicate Code (migrated from old DependenciesTab) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-rose-400" />
            <h4 className="text-sm font-semibold">{t("reports", "deadCode")} <span className="text-muted-foreground">({report.deadCode.length})</span></h4>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("reports", "deadCodeDesc")}</p>
          <div className="mt-3 space-y-1.5">
            {report.deadCode.length === 0 ? (
              <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-3 text-xs text-emerald-300">{t("reports", "noDeadCode")}</p>
            ) : (
              report.deadCode.map((d, i) => (
                <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                    <p className="truncate font-mono text-[11px]">{d.path}</p>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{d.lines}L</span>
                  </div>
                  <p className="mt-1 pl-3.5 text-[10px] text-muted-foreground">{d.reason}</p>
                </div>
              ))
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-amber-400" />
            <h4 className="text-sm font-semibold">{t("reports", "duplicateCode")} <span className="text-muted-foreground">({report.duplicates.length})</span></h4>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("reports", "duplicateCodeDesc")}</p>
          <div className="mt-3 space-y-1.5">
            {report.duplicates.length === 0 ? (
              <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-3 text-xs text-emerald-300">{t("reports", "noDuplicates")}</p>
            ) : (
              report.duplicates.map((d, i) => (
                <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">{t("reports", "group")} {d.group}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{d.lines} {t("reports", "linesDuplicated")}</span>
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    {d.files.map((f) => (
                      <p key={f} className="truncate pl-3 font-mono text-[10px] text-muted-foreground">{f}</p>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* AI-enriched duplicate analysis (deep.duplicateAnalysis) */}
          {aiDuplicates && aiDuplicates.length > 0 && (
            <div className="mt-3 space-y-2">
              {aiDuplicates.map((d: any, i: number) => (
                <div key={`ai-${i}`} className="rounded-lg border border-violet-500/15 bg-violet-500/[0.03] p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-300">{d.type}</span>
                    {d.estimatedLinesSaved ? (
                      <span className="ml-auto text-[10px] text-emerald-300">{t("reports", "aiInsights.estimatedLinesSaved")}: {d.estimatedLinesSaved}</span>
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
              <p className="mt-1 text-[10px] text-muted-foreground">{t("reports", "aiFallback.desc", { pass: t("reports", "aiInsights.duplicateAnalysis") })}</p>
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
    </div>
  );
}

/* ───────────────────────── Graph type selector ───────────────────────── */

function GraphTypeSelector({
  graphType,
  onChange,
}: {
  graphType: GraphType;
  onChange: (t: GraphType) => void;
}) {
  const { t } = useT();
  return (
    <GlassCard className="p-3">
      <div className="flex flex-wrap gap-1.5">
        {ALL_GRAPH_TYPES.map((meta) => {
          const active = graphType === meta.type;
          const label = t("codegraph", `unified.types.${meta.type}`) !== `unified.types.${meta.type}`
            ? t("codegraph", `unified.types.${meta.type}`)
            : meta.label;
          const desc = t("codegraph", `unified.descriptions.${meta.type}`) !== `unified.descriptions.${meta.type}`
            ? t("codegraph", `unified.descriptions.${meta.type}`)
            : meta.description;
          return (
            <button
              key={meta.type}
              onClick={() => onChange(meta.type)}
              title={desc}
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
