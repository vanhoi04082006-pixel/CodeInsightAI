"use client";

// UnifiedCodeGraph — Enterprise-grade graph visualization using React Flow.
//
// Features:
// - React Flow with dagre hierarchical layout (left-to-right)
// - Custom nodes (icon, color, type badge, severity)
// - Custom edges (colored by type, animated for calls)
// - Built-in pan/zoom/minimap/controls
// - Focus Mode (show only selected + neighbors)
// - Search with auto-center
// - Path highlight (dim non-path nodes)
// - Inspector panel with Impact Analysis
// - AI Analysis (type-specific prompt, sessionStorage)
// - Dead Code + Duplicate Code sections

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  type NodeTypes,
  type EdgeTypes,


  Panel,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Loader2, FileCode, Zap, Database, Route as RouteIcon,
  Package, Box, Sparkles, AlertCircle, ArrowRight, ArrowLeft,
  Crosshair, Focus, ChevronDown, Network, Copy as CopyIcon,
} from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useT, useI18nStore } from "@/lib/i18n";
import { ALL_GRAPH_TYPES } from "@/lib/graph/providers";
import type { GraphType, GraphNode, GraphEdge, GraphStats, GraphAIConfig } from "@/lib/graph/types";
import type { AnalysisReport } from "@/lib/types";

// ─── Constants ───

const TYPE_META: Record<string, { icon: any; color: string; label: string }> = {
  file: { icon: FileCode, color: "#22d3ee", label: "File" },
  function: { icon: Zap, color: "#a78bfa", label: "Function" },
  class: { icon: Database, color: "#f472b6", label: "Class" },
  module: { icon: Package, color: "#fbbf24", label: "Module" },
  route: { icon: RouteIcon, color: "#34d399", label: "Route" },
  component: { icon: Box, color: "#60a5fa", label: "Component" },
  service: { icon: Network, color: "#fb923c", label: "Service" },
  entry: { icon: FileCode, color: "#22d3ee", label: "Entry" },
  core: { icon: FileCode, color: "#a78bfa", label: "Core" },
  util: { icon: Package, color: "#fbbf24", label: "Util" },
  config: { icon: Package, color: "#64748b", label: "Config" },
  table: { icon: Database, color: "#f472b6", label: "Table" },
  import: { icon: FileCode, color: "#64748b", label: "Import" },
};

const EDGE_COLORS: Record<string, string> = {
  imports: "#64748b",
  calls: "#a78bfa",
  uses: "#22d3ee",
  extends: "#f472b6",
  implements: "#fb923c",
  depends_on: "#fbbf24",
  exports: "#34d399",
  handles: "#60a5fa",
  queries: "#f472b6",
};

// ─── Dagre layout ───

function layoutGraph(nodes: Node[], edges: Edge[], direction: "LR" | "TB" = "LR"): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, ranksep: 80, nodesep: 40, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  const nodeWidth = 200;
  const nodeHeight = 56;

  for (const n of nodes) {
    g.setNode(n.id, { width: nodeWidth, height: nodeHeight });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - nodeWidth / 2, y: pos.y - nodeHeight / 2 } };
  });
}

// ─── Custom Node Component ───

const CodeNode = ({ data, selected }: NodeProps) => {
  const meta = TYPE_META[(data as any).nodeType as string] || TYPE_META.file;
  const Icon = meta.icon;
  const isDimmed = (data as any).dimmed;
  const isHighlighted = (data as any).highlighted;
  const severity = (data as any).severity as string | undefined;

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 rounded-lg border px-3 py-2 transition-all duration-200",
        "bg-popover/95 backdrop-blur-sm shadow-md",
        selected
          ? "border-cyan-400/60 ring-2 ring-cyan-400/30 shadow-cyan-500/20"
          : isHighlighted
          ? "border-violet-400/50 shadow-violet-500/20"
          : "border-white/10",
        isDimmed && "opacity-25",
      )}
      style={{ width: 200 }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-muted-foreground/40" />
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
        style={{ background: `${meta.color}1a`, color: meta.color, border: `1px solid ${meta.color}33` }}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{(data as any).label}</p>
        <p className="truncate text-[9px] text-muted-foreground">{(data as any).sublabel || meta.label}</p>
      </div>
      {severity && severity !== "low" && (
        <span
          className={cn(
            "absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background",
            severity === "critical" ? "bg-red-500" : severity === "high" ? "bg-orange-500" : "bg-yellow-500",
          )}
        />
      )}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-muted-foreground/40" />
    </div>
  );
};

// ─── Custom Edge Component ───

const CodeEdge = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps) => {
  const color = EDGE_COLORS[(data as any)?.edgeType as string] || "#64748b";
  const isDimmed = (data as any)?.dimmed;
  const isAnimated = (data as any)?.edgeType === "calls";

  // Simple bezier curve
  const cx = (sourceX + targetX) / 2;
  const path = `M ${sourceX} ${sourceY} C ${cx} ${sourceY}, ${cx} ${targetY}, ${targetX} ${targetY}`;

  return (
    <g className={cn("transition-opacity duration-200", isDimmed && "opacity-15")}>
      <path
        id={id}
        d={path}
        fill="none"
        stroke={selected ? "#22d3ee" : color}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeOpacity={0.7}
        markerEnd={`url(#arrow-${color.replace("#", "")})`}
        className={cn(isAnimated && !isDimmed && "react-flow__edge-path_animated")}
      />
    </g>
  );
};

const nodeTypes: NodeTypes = { codeNode: CodeNode };
const edgeTypes: EdgeTypes = { codeEdge: CodeEdge };

// ─── Main Component ───

function GraphInner({ analysisId, report }: { analysisId: string | null; report: AnalysisReport }) {
  const { t } = useT();
  const [graphType, setGraphType] = useState<GraphType>("dependencies");
  const [allNodes, setAllNodes] = useState<GraphNode[]>([]);
  const [allEdges, setAllEdges] = useState<GraphEdge[]>([]);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [aiConfig, setAiConfig] = useState<GraphAIConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [inspector, setInspector] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [pathHighlight, setPathHighlight] = useState<string[] | null>(null);
  const [impactData, setImpactData] = useState<any>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [layoutDir, setLayoutDir] = useState<"LR" | "TB">("LR");

  // AI state
  const aiStorageKey = analysisId ? `unified-graph-ai-${analysisId}-${graphType}` : "";
  const [aiResult, setAiResult] = useState<string | null>(() => {
    try { return sessionStorage.getItem(aiStorageKey); } catch { return null; }
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(() => {
    try { return !!sessionStorage.getItem(aiStorageKey); } catch { return false; }
  });

  const { fitView, setCenter, getNode } = useReactFlow();

  // Fetch graph data
  useEffect(() => {
    if (!analysisId) return;
    setLoading(true);
    setSelected(null);
    setInspector(null);
    setFocusMode(false);
    setPathHighlight(null);
    const ctrl = new AbortController();
    fetch(`/api/graph/${analysisId}?type=${graphType}&q=full`, { signal: ctrl.signal })
      .then(r => r.json())
      .then((data: { nodes: GraphNode[]; edges: GraphEdge[]; stats: GraphStats; aiConfig: GraphAIConfig }) => {
        setAllNodes(data.nodes || []);
        setAllEdges(data.edges || []);
        setStats(data.stats || null);
        setAiConfig(data.aiConfig || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => ctrl.abort();
  }, [analysisId, graphType]);

  // AI result from sessionStorage
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(aiStorageKey);
      setAiResult(cached);
      setAiExpanded(!!cached);
    } catch { setAiResult(null); setAiExpanded(false); }
  }, [aiStorageKey]);

  // Convert to React Flow format
  const rfNodes: Node[] = useMemo(() => {
    let nodes = allNodes.map(n => {
      const meta = TYPE_META[n.type] || TYPE_META.file;
      const isConnected = selected
        ? allEdges.some(e => e.from === n.id || e.to === n.id) || n.id === selected
        : true;
      const inPath = pathHighlight?.includes(n.id) ?? false;
      const dimmed = focusMode ? !isConnected : pathHighlight ? !inPath && n.id !== selected : false;
      const highlighted = inPath || n.id === selected;

      return {
        id: n.id,
        type: "codeNode",
        position: { x: 0, y: 0 },
        data: {
          label: n.label,
          sublabel: n.filePath?.split("/").pop() || meta.label,
          nodeType: n.type,
          severity: n.metadata?.severity,
          dimmed,
          highlighted,
        },
      };
    });

    if (focusMode && selected) {
      nodes = nodes.filter(n => n.data.dimmed === false || n.id === selected);
    }

    const edgesForLayout = focusMode && selected
      ? allEdges.filter(e => e.from === selected || e.to === selected)
      : allEdges;

    const rfEdges = edgesForLayout.map(e => ({
      id: `${e.from}→${e.to}`,
      source: e.from,
      target: e.to,
      type: "codeEdge",
      data: { edgeType: e.type, dimmed: pathHighlight ? !pathHighlight.includes(e.from) && !pathHighlight.includes(e.to) : false },
    }));

    return layoutGraph(nodes, rfEdges, layoutDir);
  }, [allNodes, allEdges, selected, focusMode, pathHighlight, layoutDir]);

  const rfEdges: Edge[] = useMemo(() => {
    const edges = focusMode && selected
      ? allEdges.filter(e => e.from === selected || e.to === selected)
      : allEdges;
    return edges.map(e => ({
      id: `${e.from}→${e.to}`,
      source: e.from,
      target: e.to,
      type: "codeEdge",
      animated: e.type === "calls",
      data: {
        edgeType: e.type,
        dimmed: pathHighlight ? !pathHighlight.includes(e.from) && !pathHighlight.includes(e.to) : false,
      },
    }));
  }, [allEdges, selected, focusMode, pathHighlight]);

  // Auto-fit after layout
  useEffect(() => {
    if (rfNodes.length > 0 && !loading) {
      setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100);
    }
  }, [rfNodes, loading, fitView]);

  // Node click → inspector
  const onNodeClick: (_e: any, node: Node) => void = useCallback((_, node) => {
    setSelected(node.id);
    setPathHighlight(null);
    if (!analysisId) return;
    fetch(`/api/graph/${analysisId}?type=${graphType}&q=inspector&node=${encodeURIComponent(node.id)}`)
      .then(r => r.json())
      .then(data => { if (data?.inspector) setInspector(data.inspector); })
      .catch(() => {});
  }, [analysisId, graphType]);

  // Search → center on first match
  useEffect(() => {
    if (!search.trim() || allNodes.length === 0) return;
    const match = allNodes.find(n =>
      n.label.toLowerCase().includes(search.toLowerCase()) ||
      (n.filePath?.toLowerCase().includes(search.toLowerCase()) ?? false)
    );
    if (match) {
      const node = getNode(match.id);
      if (node) {
        setCenter(node.position.x + 100, node.position.y + 28, { zoom: 1.2, duration: 400 });
      }
    }
  }, [search, allNodes, getNode, setCenter]);

  // Impact analysis
  const runImpact = async () => {
    if (!selected || !analysisId) return;
    setImpactLoading(true);
    try {
      const r = await fetch(`/api/graph/${analysisId}?type=${graphType}&q=impact&node=${encodeURIComponent(selected)}`);
      const data = await r.json();
      setImpactData(data);
      if (data?.impacted) {
        const ids = [selected, ...data.impacted.map((n: any) => n.id)];
        setPathHighlight(ids);
      }
    } catch {} finally { setImpactLoading(false); }
  };

  // AI analysis
  const runAI = async () => {
    if (!analysisId || aiLoading || !aiConfig) return;
    setAiLoading(true);
    setAiExpanded(true);
    try {
      const contextBlock = [
        `Graph Type: ${graphType}`,
        `Stats: ${stats?.totalNodes ?? 0} nodes, ${stats?.totalEdges ?? 0} edges, ${stats?.circularDeps?.length ?? 0} cycles`,
        stats ? `Top nodes: ${allNodes.slice(0, 5).map(n => n.label).join(", ")}` : "",
      ].filter(Boolean).join("\n");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `${aiConfig.prompt}\n\n--- Graph Context ---\n${contextBlock}\n\nProvide concrete findings. Cite specific node labels. Respond in markdown.`,
          language: useI18nStore.getState().locale,
        }),
      });
      const data = await res.json();
      const reply = data.reply || data.message?.content || "No response";
      setAiResult(reply);
      try { sessionStorage.setItem(aiStorageKey, reply); } catch {}
    } catch {
      setAiResult("AI analysis unavailable");
    } finally { setAiLoading(false); }
  };

  const selectedNode = selected ? allNodes.find(n => n.id === selected) : null;
  const deep = (report as any).deepAnalysis;

  // ─── Render ───

  return (
    <div className="space-y-3">
      {/* Graph Type Selector */}
      <div className="flex flex-wrap items-center gap-2">
        {ALL_GRAPH_TYPES.map(gt => (
          <button
            key={gt.type}
            onClick={() => setGraphType(gt.type)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
              graphType === gt.type
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300 shadow-sm"
                : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/20 hover:text-foreground",
            )}
          >
            <span>{gt.icon}</span>
            {gt.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setLayoutDir(d => d === "LR" ? "TB" : "LR")} className="text-[10px]">
            {layoutDir === "LR" ? "→ Horizontal" : "↓ Vertical"}
          </Button>
        </div>
      </div>

      {/* Main graph + inspector layout */}
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        {/* Graph canvas */}
        <div className="relative h-[500px] overflow-hidden rounded-xl border border-white/10 bg-background/50">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
            </div>
          ) : allNodes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("codegraph", "unified.empty")}
            </div>
          ) : (
            <>
              <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodeClick={onNodeClick}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.2}
                maxZoom={3}
                proOptions={{ hideAttribution: true }}
                className="bg-transparent"
              >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.05)" />
                <Controls className="!border-white/10 !bg-popover/90" showInteractive={false} />
                <MiniMap
                  className="!rounded-lg !border-white/10 !bg-popover/90"
                  nodeColor={(n) => {
                    const meta = TYPE_META[(n.data as any)?.nodeType as string] || TYPE_META.file;
                    return meta.color;
                  }}
                  maskColor="rgba(0,0,0,0.6)"
                  pannable
                  zoomable
                />
                {/* Search + focus controls overlay */}
                <Panel position="top-left" className="!m-2">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={t("codegraph", "unified.search")}
                        className="h-8 w-48 rounded-lg border border-white/10 bg-popover/90 pl-7 pr-2 text-xs outline-none backdrop-blur-sm focus:border-cyan-400/40"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant={selected ? "outline" : "ghost"}
                      onClick={() => { setFocusMode(!focusMode); if (focusMode) { setSelected(null); setInspector(null); } }}
                      disabled={!selected}
                      className="h-8 border-white/10 bg-popover/90 text-[10px] backdrop-blur-sm"
                      title="Focus mode — show only selected node + neighbors"
                    >
                      <Focus className="mr-1 h-3 w-3" />
                      {focusMode ? "Exit Focus" : "Focus"}
                    </Button>
                    {pathHighlight && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setPathHighlight(null); setImpactData(null); }}
                        className="h-8 bg-popover/90 text-[10px] backdrop-blur-sm"
                      >
                        <Crosshair className="mr-1 h-3 w-3" />
                        Clear Path
                      </Button>
                    )}
                  </div>
                </Panel>
                {/* Stats overlay */}
                {stats && (
                  <Panel position="bottom-left" className="!m-2">
                    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-popover/90 px-3 py-1.5 text-[10px] backdrop-blur-sm">
                      <span className="text-cyan-300">{stats.totalNodes} nodes</span>
                      <span className="text-violet-300">{stats.totalEdges} edges</span>
                      {(stats.circularDeps?.length ?? 0) > 0 && (
                        <span className="text-rose-400">{stats.circularDeps.length} cycles</span>
                      )}
                    </div>
                  </Panel>
                )}
              </ReactFlow>
            </>
          )}
        </div>

        {/* Inspector panel */}
        <div className="space-y-3">
          <GlassCard className="p-4">
            {selectedNode ? (
              <div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const meta = TYPE_META[selectedNode.type] || TYPE_META.file;
                    const Icon = meta.icon;
                    return (
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${meta.color}1a`, color: meta.color }}>
                        <Icon className="h-4 w-4" />
                      </div>
                    );
                  })()}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{selectedNode.label}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{selectedNode.filePath || selectedNode.type}</p>
                  </div>
                </div>

                {/* Impact button */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runImpact}
                  disabled={impactLoading}
                  className="mt-3 w-full border-amber-400/30 text-amber-300 hover:bg-amber-500/10"
                >
                  {impactLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Crosshair className="mr-1 h-3 w-3" />}
                  Impact Analysis
                </Button>

                {impactData && (
                  <div className="mt-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-2 text-xs">
                    <p className="font-medium text-amber-300">
                      {impactData.impacted?.length || 0} nodes affected
                    </p>
                    <p className="text-[10px] text-muted-foreground">Path highlighted on graph</p>
                  </div>
                )}

                {/* Incoming/Outgoing */}
                {inspector && (
                  <div className="mt-3 space-y-2">
                    {inspector.incoming?.length > 0 && (
                      <div>
                        <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-cyan-300">
                          <ArrowLeft className="h-3 w-3" /> Incoming ({inspector.incoming.length})
                        </p>
                        <div className="space-y-0.5">
                          {inspector.incoming.slice(0, 8).map((e: any, i: number) => (
                            <button
                              key={i}
                              onClick={() => { setSelected(e.from); }}
                              className="block w-full truncate rounded px-2 py-0.5 text-left text-[10px] text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                            >
                              ← {allNodes.find(n => n.id === e.from)?.label || e.from}
                              <span className="ml-1 text-[8px] text-muted-foreground/60">({e.type})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {inspector.outgoing?.length > 0 && (
                      <div>
                        <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-violet-300">
                          <ArrowRight className="h-3 w-3" /> Outgoing ({inspector.outgoing.length})
                        </p>
                        <div className="space-y-0.5">
                          {inspector.outgoing.slice(0, 8).map((e: any, i: number) => (
                            <button
                              key={i}
                              onClick={() => { setSelected(e.to); }}
                              className="block w-full truncate rounded px-2 py-0.5 text-left text-[10px] text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                            >
                              → {allNodes.find(n => n.id === e.to)?.label || e.to}
                              <span className="ml-1 text-[8px] text-muted-foreground/60">({e.type})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground">{t("codegraph", "unified.noSelection")}</p>
            )}
          </GlassCard>

          {/* AI Analysis */}
          <GlassCard className="p-4">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-violet-300" />
                {aiConfig?.title || "AI Analysis"}
              </h4>
              <Button
                size="sm"
                variant="outline"
                onClick={runAI}
                disabled={aiLoading || !aiConfig}
                className="border-violet-400/30 text-violet-300 hover:bg-violet-500/10"
              >
                {aiLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                {aiLoading ? "..." : "Run"}
              </Button>
            </div>
            <AnimatePresence>
              {(aiResult || aiLoading) && aiExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  {aiLoading ? (
                    <p className="mt-2 flex items-center gap-2 text-xs text-amber-300">
                      <Loader2 className="h-3 w-3 animate-spin" /> AI analyzing graph...
                    </p>
                  ) : (
                    <pre className="mt-2 max-h-[300px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[11px] leading-relaxed text-foreground/85 scrollbar-thin">{aiResult}</pre>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>
        </div>
      </div>

      {/* Dead Code + Duplicate Code */}
      <div className="grid gap-3 md:grid-cols-2">
        <GlassCard className="p-4">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <FileCode className="h-4 w-4 text-rose-400" />
            Dead Code <span className="text-muted-foreground">({report.deadCode?.length || 0})</span>
          </h4>
          <div className="mt-2 max-h-32 space-y-0.5 overflow-y-auto scrollbar-thin">
            {report.deadCode?.length === 0 ? (
              <p className="text-xs text-muted-foreground">No dead code detected</p>
            ) : (
              report.deadCode?.slice(0, 20).map((d: any, i: number) => (
                <p key={i} className="truncate text-[10px] text-muted-foreground">{d.path || d}</p>
              ))
            )}
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <CopyIcon className="h-4 w-4 text-amber-400" />
            Duplicate Code <span className="text-muted-foreground">({report.duplicates?.length || 0})</span>
          </h4>
          <div className="mt-2 max-h-32 space-y-0.5 overflow-y-auto scrollbar-thin">
            {report.duplicates?.length === 0 ? (
              <p className="text-xs text-muted-foreground">No duplicates detected</p>
            ) : (
              report.duplicates?.slice(0, 20).map((d: any, i: number) => (
                <p key={i} className="truncate text-[10px] text-muted-foreground">{d.group || d.files?.join(", ") || JSON.stringify(d).slice(0, 60)}</p>
              ))
            )}
          </div>
        </GlassCard>
      </div>

      {/* AI Duplicate Analysis */}
      {deep?.duplicateAnalysis?.length > 0 && (
        <GlassCard className="border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-transparent p-4">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-violet-300" />
            AI Duplicate Analysis
            <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px] text-violet-300">AI</span>
          </h4>
          <div className="mt-2 space-y-2">
            {deep.duplicateAnalysis.slice(0, 5).map((d: any, i: number) => (
              <div key={i} className="rounded border border-violet-500/10 bg-violet-500/[0.03] p-2">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-violet-500/15 px-1 text-[9px] font-bold uppercase text-violet-300">{d.type}</span>
                  {d.estimatedLinesSaved && <span className="ml-auto text-[10px] text-emerald-300">~{d.estimatedLinesSaved} lines</span>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{d.description}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/70">{d.recommendation}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

export function UnifiedCodeGraph({ analysisId, report }: { analysisId: string | null; report: AnalysisReport }) {
  return (
    <ReactFlowProvider>
      <GraphInner analysisId={analysisId} report={report} />
    </ReactFlowProvider>
  );
}
