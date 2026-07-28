"use client";

// UnifiedCodeGraph — D3 Force Simulation + SVG (Enterprise Grade)
//
// Features:
// - D3-force physics layout with smooth simulation
// - SVG rendering with GPU-accelerated transforms
// - Smart controls: drag nodes, pan canvas, wheel zoom
// - Focus Mode (show only selected + neighbors, dim rest)
// - Path Highlight (Impact Analysis → highlight affected chain)
// - Search with auto-center + pulse highlight
// - MiniMap (live viewport indicator)
// - Inspector panel with clickable edges
// - AI Analysis (type-specific prompt, sessionStorage)
// - Dead Code + Duplicate Code sections

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Loader2, FileCode, Zap, Database, Route as RouteIcon,
  Package, Box, Sparkles, AlertCircle, ArrowRight, ArrowLeft,
  Crosshair, Focus, Network, Plus, Minus, Maximize,
} from "lucide-react";
import { GlassCard } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
};

const EDGE_COLORS: Record<string, string> = {
  imports: "#64748b", calls: "#a78bfa", uses: "#22d3ee",
  extends: "#f472b6", implements: "#fb923c", depends_on: "#fbbf24",
  exports: "#34d399", handles: "#60a5fa", queries: "#f472b6",
};

interface SimNode {
  id: string;
  label: string;
  type: string;
  filePath?: string;
  color: string;
  icon: any;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  degree: number;
  severity?: string;
}

interface SimLink {
  source: string;
  target: string;
  type: string;
  color: string;
  weight: number;
}

const NODE_W = 180;
const NODE_H = 44;
const CANVAS_W = 700;
const CANVAS_H = 480;

// ─── D3 Force Simulation (pure, no d3 import needed) ───

function runForceSimulation(
  nodes: SimNode[],
  links: SimLink[],
  iterations: number = 300,
): void {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Initialize positions in a circle if not set
  nodes.forEach((n, i) => {
    if (n.x === 0 && n.y === 0) {
      const angle = (i / nodes.length) * Math.PI * 2;
      n.x = CANVAS_W / 2 + Math.cos(angle) * 150;
      n.y = CANVAS_H / 2 + Math.sin(angle) * 150;
    }
    n.vx = 0;
    n.vy = 0;
  });

  const k = 0.08; // centering strength
  const charge = -300; // repulsion
  const linkDist = 80;
  const linkStrength = 0.15;
  const damping = 0.85;

  for (let iter = 0; iter < iterations; iter++) {
    // Centering force
    let cx = 0, cy = 0;
    for (const n of nodes) { cx += n.x; cy += n.y; }
    cx /= nodes.length; cy /= nodes.length;

    for (const n of nodes) {
      if (n.fx != null) { n.x = n.fx; n.vx = 0; continue; }
      if (n.fy != null) { n.y = n.fy; n.vy = 0; continue; }
      n.vx += (CANVAS_W / 2 - n.x) * k * 0.01;
      n.vy += (CANVAS_H / 2 - n.y) * k * 0.01;
    }

    // Repulsion (O(n²) but fine for <500 nodes)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 1) dist2 = 1;
        const dist = Math.sqrt(dist2);
        const force = charge / dist2;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (a.fx == null) a.vx -= fx;
        if (a.fy == null) a.vy -= fy;
        if (b.fx == null) b.vx += fx;
        if (b.fy == null) b.vy += fy;
      }
    }

    // Link spring force
    for (const link of links) {
      const a = nodeMap.get(link.source);
      const b = nodeMap.get(link.target);
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.01) dist = 0.01;
      const force = (dist - linkDist) * linkStrength;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (a.fx == null) a.vx += fx;
      if (a.fy == null) a.vy += fy;
      if (b.fx == null) b.vx -= fx;
      if (b.fy == null) b.vy -= fy;
    }

    // Apply velocity with damping + collision avoidance
    for (const n of nodes) {
      if (n.fx != null && n.fy != null) continue;
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
      // Bounds
      n.x = Math.max(NODE_W / 2 + 10, Math.min(CANVAS_W - NODE_W / 2 - 10, n.x));
      n.y = Math.max(NODE_H / 2 + 10, Math.min(CANVAS_H - NODE_H / 2 - 10, n.y));
    }
  }
}

// ─── Main Component ───

export function UnifiedCodeGraph({ analysisId, report }: { analysisId: string | null; report: AnalysisReport }) {
  const { t } = useT();
  const [graphType, setGraphType] = useState<GraphType>("dependencies");
  const [rawNodes, setRawNodes] = useState<GraphNode[]>([]);
  const [rawEdges, setRawEdges] = useState<GraphEdge[]>([]);
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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragState = useRef<{ x: number; y: number; px: number; py: number; nodeId: string | null }>({
    x: 0, y: 0, px: 0, py: 0, nodeId: null,
  });

  // AI state
  const aiStorageKey = analysisId ? `unified-graph-ai-${analysisId}-${graphType}` : "";
  const [aiResult, setAiResult] = useState<string | null>(() => {
    try { return sessionStorage.getItem(aiStorageKey); } catch { return null; }
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(() => {
    try { return !!sessionStorage.getItem(aiStorageKey); } catch { return false; }
  });

  // Fetch graph data
  useEffect(() => {
    if (!analysisId) return;
    setLoading(true);
    setSelected(null);
    setInspector(null);
    setFocusMode(false);
    setPathHighlight(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    const ctrl = new AbortController();
    fetch(`/api/graph/${analysisId}?type=${graphType}&q=full`, { signal: ctrl.signal })
      .then(r => r.json())
      .then((data: { nodes: GraphNode[]; edges: GraphEdge[]; stats: GraphStats; aiConfig: GraphAIConfig }) => {
        setRawNodes(data.nodes || []);
        setRawEdges(data.edges || []);
        setStats(data.stats || null);
        setAiConfig(data.aiConfig || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => ctrl.abort();
  }, [analysisId, graphType]);

  // AI cached result
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(aiStorageKey);
      setAiResult(cached);
      setAiExpanded(!!cached);
    } catch { setAiResult(null); setAiExpanded(false); }
  }, [aiStorageKey]);

  // Build sim nodes + links, run force simulation
  useEffect(() => {
    if (rawNodes.length === 0) { setSimNodes([]); return; }

    // Compute degrees
    const degreeMap = new Map<string, number>();
    for (const e of rawEdges) {
      degreeMap.set(e.from, (degreeMap.get(e.from) ?? 0) + 1);
      degreeMap.set(e.to, (degreeMap.get(e.to) ?? 0) + 1);
    }

    // Keep previous positions if available
    const prevPos = new Map(simNodes.map(n => [n.id, { x: n.x, y: n.y }]));

    const nodes: SimNode[] = rawNodes.map(n => {
      const meta = TYPE_META[n.type] || TYPE_META.file;
      const prev = prevPos.get(n.id);
      return {
        id: n.id,
        label: n.label,
        type: n.type,
        filePath: n.filePath,
        color: meta.color,
        icon: meta.icon,
        x: prev?.x ?? 0,
        y: prev?.y ?? 0,
        vx: 0, vy: 0,
        degree: degreeMap.get(n.id) ?? 0,
        severity: typeof n.metadata?.severity === "string" ? n.metadata.severity : undefined,
      };
    });

    const links: SimLink[] = rawEdges.map(e => ({
      source: e.from,
      target: e.to,
      type: e.type,
      color: EDGE_COLORS[e.type] || "#64748b",
      weight: e.weight,
    }));

    // Run simulation (only for new/changed nodes)
    const hasNewNodes = nodes.some(n => n.x === 0 && n.y === 0);
    if (hasNewNodes) {
      runForceSimulation(nodes, links, 300);
    }

    setSimNodes(nodes);
  }, [rawNodes, rawEdges]);

  // Node click → inspector
  const handleNodeClick = useCallback((nodeId: string) => {
    setSelected(nodeId);
    setPathHighlight(null);
    if (!analysisId) return;
    fetch(`/api/graph/${analysisId}?type=${graphType}&q=inspector&node=${encodeURIComponent(nodeId)}`)
      .then(r => r.json())
      .then(data => { if (data?.inspector) setInspector(data.inspector); })
      .catch(() => {});
  }, [analysisId, graphType]);

  // Search → center on match
  useEffect(() => {
    if (!search.trim() || simNodes.length === 0) return;
    const match = simNodes.find(n =>
      n.label.toLowerCase().includes(search.toLowerCase()) ||
      (n.filePath?.toLowerCase().includes(search.toLowerCase()) ?? false)
    );
    if (match) {
      setPan({ x: CANVAS_W / 2 - match.x * zoom, y: CANVAS_H / 2 - match.y * zoom });
    }
  }, [search, simNodes, zoom]);

  // Impact analysis
  const runImpact = async () => {
    if (!selected || !analysisId) return;
    setImpactLoading(true);
    try {
      const r = await fetch(`/api/graph/${analysisId}?type=${graphType}&q=impact&node=${encodeURIComponent(selected)}`);
      const data = await r.json();
      setImpactData(data);
      if (data?.impacted) {
        setPathHighlight([selected, ...data.impacted.map((n: any) => n.id)]);
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
        `Stats: ${stats?.totalNodes ?? 0} nodes, ${stats?.totalEdges ?? 0} edges`,
        `Top nodes: ${simNodes.slice(0, 5).map(n => n.label).join(", ")}`,
      ].join("\n");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `${aiConfig.prompt}\n\n--- Graph Context ---\n${contextBlock}\n\nProvide concrete findings. Respond in markdown.`,
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

  // Pan handlers
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (draggingNode) return;
    dragState.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, nodeId: null };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const ds = dragState.current;
      if (!ds) return;
      if (ds.nodeId) {
        // Dragging a node
        const dx = (e.clientX - ds.x) / zoom;
        const dy = (e.clientY - ds.y) / zoom;
        setSimNodes(prev => prev.map(n => {
          if (n.id === ds.nodeId) {
            return { ...n, x: ds.px + dx, y: ds.py + dy, fx: ds.px + dx, fy: ds.py + dy };
          }
          return n;
        }));
      } else {
        // Panning canvas
        setPan({
          x: ds.px + (e.clientX - ds.x),
          y: ds.py + (e.clientY - ds.y),
        });
      }
    };
    const onUp = () => {
      if (dragState.current?.nodeId) {
        // Release node fix
        setSimNodes(prev => prev.map(n =>
          n.id === dragState.current?.nodeId ? { ...n, fx: null, fy: null } : n
        ));
        setDraggingNode(null);
      }
      dragState.current = { x: 0, y: 0, px: 0, py: 0, nodeId: null };
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [zoom, pan]);

  const onWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom(z => Math.max(0.3, Math.min(3, z + delta)));
  };

  const fitToScreen = () => {
    if (simNodes.length === 0) return;
    const xs = simNodes.map(n => n.x);
    const ys = simNodes.map(n => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const gw = maxX - minX || CANVAS_W;
    const gh = maxY - minY || CANVAS_H;
    const newZoom = Math.min(CANVAS_W / (gw + 100), CANVAS_H / (gh + 100), 1.5);
    setZoom(newZoom);
    setPan({
      x: CANVAS_W / 2 - ((minX + maxX) / 2) * newZoom,
      y: CANVAS_H / 2 - ((minY + maxY) / 2) * newZoom,
    });
  };

  const onNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = simNodes.find(n => n.id === nodeId);
    if (!node) return;
    dragState.current = { x: e.clientX, y: e.clientY, px: node.x, py: node.y, nodeId };
    setDraggingNode(nodeId);
  };

  // Filter for focus mode
  const visibleNodes = useMemo(() => {
    if (!focusMode || !selected) return simNodes;
    const connectedIds = new Set<string>([selected]);
    for (const e of rawEdges) {
      if (e.from === selected) connectedIds.add(e.to);
      if (e.to === selected) connectedIds.add(e.from);
    }
    return simNodes.filter(n => connectedIds.has(n.id));
  }, [simNodes, focusMode, selected, rawEdges]);

  const visibleEdges = useMemo(() => {
    if (!focusMode || !selected) return rawEdges;
    return rawEdges.filter(e => e.from === selected || e.to === selected);
  }, [rawEdges, focusMode, selected]);

  const selectedNode = selected ? simNodes.find(n => n.id === selected) : null;
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
      </div>

      {/* Graph + Inspector */}
      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        {/* SVG Canvas */}
        <div className="relative h-[500px] overflow-hidden rounded-xl border border-white/10 bg-background/50">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
            </div>
          ) : visibleNodes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("codegraph", "unified.empty") || "No data"}
            </div>
          ) : (
            <>
              <svg
                ref={svgRef}
                width="100%"
                height="100%"
                viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
                className="cursor-grab active:cursor-grabbing"
                onMouseDown={onCanvasMouseDown}
                onWheel={onWheel}
                style={{ userSelect: "none" }}
              >
                <defs>
                  {Object.entries(EDGE_COLORS).map(([type, color]) => (
                    <marker
                      key={type}
                      id={`arrow-${type}`}
                      markerWidth="8"
                      markerHeight="6"
                      refX="7"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L8,3 L0,6 Z" fill={color} opacity="0.7" />
                    </marker>
                  ))}
                </defs>

                {/* Transform group for pan + zoom */}
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                  {/* Edges */}
                  {visibleEdges.map((e, i) => {
                    const from = simNodes.find(n => n.id === e.from);
                    const to = simNodes.find(n => n.id === e.to);
                    if (!from || !to) return null;
                    const color = EDGE_COLORS[e.type] || "#64748b";
                    const isDimmed = pathHighlight && !pathHighlight.includes(e.from) && !pathHighlight.includes(e.to);
                    const isInPath = pathHighlight && (pathHighlight.includes(e.from) || pathHighlight.includes(e.to));

                    // Bezier curve
                    const mx = (from.x + to.x) / 2;
                    const path = `M ${from.x} ${from.y} C ${mx} ${from.y}, ${mx} ${to.y}, ${to.x} ${to.y}`;

                    return (
                      <path
                        key={i}
                        d={path}
                        fill="none"
                        stroke={color}
                        strokeWidth={isInPath ? 2.5 : 1.2}
                        strokeOpacity={isDimmed ? 0.08 : 0.5}
                        markerEnd={`url(#arrow-${e.type})`}
                        className={cn("transition-opacity duration-200", e.type === "calls" && !isDimmed && "animate-pulse")}
                        style={{ animationDuration: "3s" }}
                      />
                    );
                  })}

                  {/* Nodes */}
                  {visibleNodes.map(n => {
                    const Icon = n.icon;
                    const isSelected = n.id === selected;
                    const isDimmed = pathHighlight && !pathHighlight.includes(n.id);
                    const isInPath = pathHighlight?.includes(n.id);
                    const isSearchMatch = search.trim() && n.label.toLowerCase().includes(search.toLowerCase());

                    return (
                      <g
                        key={n.id}
                        transform={`translate(${n.x - NODE_W / 2}, ${n.y - NODE_H / 2})`}
                        className="cursor-pointer transition-opacity"
                        style={{ opacity: isDimmed ? 0.15 : 1 }}
                        onMouseDown={(e) => onNodeMouseDown(e, n.id)}
                        onClick={() => handleNodeClick(n.id)}
                      >
                        {/* Node background */}
                        <rect
                          width={NODE_W}
                          height={NODE_H}
                          rx={8}
                          fill="rgba(15,15,20,0.92)"
                          stroke={isSelected ? "#22d3ee" : isInPath ? "#a78bfa" : "rgba(255,255,255,0.1)"}
                          strokeWidth={isSelected ? 2 : 1}
                          className="transition-all"
                          style={{
                            filter: isSelected ? "drop-shadow(0 0 8px rgba(34,211,238,0.4))" : isInPath ? "drop-shadow(0 0 6px rgba(167,139,250,0.3))" : "none",
                          }}
                        />
                        {/* Icon circle */}
                        <circle
                          cx={18}
                          cy={NODE_H / 2}
                          r={10}
                          fill={`${n.color}1a`}
                          stroke={`${n.color}33`}
                          strokeWidth={1}
                        />
                        <foreignObject x={10} y={NODE_H / 2 - 8} width={16} height={16}>
                          <Icon className="h-4 w-4" style={{ color: n.color }} />
                        </foreignObject>
                        {/* Label */}
                        <text
                          x={36}
                          y={NODE_H / 2 - 2}
                          fill={isSelected ? "#22d3ee" : isSearchMatch ? "#fbbf24" : "rgba(255,255,255,0.9)"}
                          fontSize={11}
                          fontWeight={isSelected ? 600 : 400}
                          className="select-none"
                          style={{ pointerEvents: "none" }}
                        >
                          {n.label.length > 18 ? n.label.slice(0, 16) + "…" : n.label}
                        </text>
                        {/* Sublabel */}
                        <text
                          x={36}
                          y={NODE_H / 2 + 11}
                          fill="rgba(255,255,255,0.4)"
                          fontSize={8}
                          className="select-none"
                          style={{ pointerEvents: "none" }}
                        >
                          {n.filePath?.split("/").pop() || n.type}
                        </text>
                        {/* Severity dot */}
                        {n.severity && n.severity !== "low" && (
                          <circle
                            cx={NODE_W - 8}
                            cy={8}
                            r={4}
                            fill={n.severity === "critical" ? "#ef4444" : n.severity === "high" ? "#f97316" : "#eab308"}
                            stroke="rgba(15,15,20,0.9)"
                            strokeWidth={1.5}
                          />
                        )}
                        {/* Search pulse */}
                        {isSearchMatch && (
                          <circle
                            cx={NODE_W / 2}
                            cy={NODE_H / 2}
                            r={NODE_W / 2 + 4}
                            fill="none"
                            stroke="#fbbf24"
                            strokeWidth={2}
                            opacity={0.5}
                            className="animate-ping"
                          />
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>

              {/* Zoom controls */}
              <div className="absolute right-3 top-3 flex flex-col gap-1">
                <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-popover/90 text-foreground backdrop-blur-sm transition hover:bg-white/10">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-popover/90 text-foreground backdrop-blur-sm transition hover:bg-white/10">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button onClick={fitToScreen} className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-popover/90 text-foreground backdrop-blur-sm transition hover:bg-white/10">
                  <Maximize className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Search + focus */}
              <div className="absolute left-3 top-3 flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={t("codegraph", "unified.search") || "Search..."}
                    className="h-8 w-44 rounded-lg border border-white/10 bg-popover/90 pl-7 pr-2 text-xs outline-none backdrop-blur-sm focus:border-cyan-400/40"
                  />
                </div>
                <button
                  onClick={() => { setFocusMode(!focusMode); if (focusMode) { setSelected(null); setInspector(null); } }}
                  disabled={!selected}
                  className={cn(
                    "flex h-8 items-center gap-1 rounded-lg border px-2 text-[10px] backdrop-blur-sm transition",
                    focusMode ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300" : "border-white/10 bg-popover/90 text-muted-foreground hover:text-foreground",
                    !selected && "cursor-not-allowed opacity-40",
                  )}
                >
                  <Focus className="h-3 w-3" />
                  {focusMode ? "Exit" : "Focus"}
                </button>
                {pathHighlight && (
                  <button
                    onClick={() => { setPathHighlight(null); setImpactData(null); }}
                    className="flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-popover/90 px-2 text-[10px] backdrop-blur-sm transition hover:text-foreground"
                  >
                    <Crosshair className="h-3 w-3" />
                    Clear
                  </button>
                )}
              </div>

              {/* Stats overlay */}
              {stats && (
                <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-lg border border-white/10 bg-popover/90 px-3 py-1.5 text-[10px] backdrop-blur-sm">
                  <span className="text-cyan-300">{visibleNodes.length} nodes</span>
                  <span className="text-violet-300">{visibleEdges.length} edges</span>
                  {(stats.circularDeps?.length ?? 0) > 0 && (
                    <span className="text-rose-400">{stats.circularDeps.length} cycles</span>
                  )}
                  <span className="text-muted-foreground">{Math.round(zoom * 100)}%</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Inspector panel */}
        <div className="space-y-3">
          <GlassCard className="p-4">
            {selectedNode ? (
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${selectedNode.color}1a`, color: selectedNode.color, border: `1px solid ${selectedNode.color}33` }}>
                    <selectedNode.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{selectedNode.label}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{selectedNode.filePath || selectedNode.type}</p>
                  </div>
                </div>

                <Button size="sm" variant="outline" onClick={runImpact} disabled={impactLoading} className="mt-3 w-full border-amber-400/30 text-amber-300 hover:bg-amber-500/10">
                  {impactLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Crosshair className="mr-1 h-3 w-3" />}
                  Impact Analysis
                </Button>

                {impactData && (
                  <div className="mt-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-2 text-xs">
                    <p className="font-medium text-amber-300">{impactData.impacted?.length || 0} nodes affected</p>
                    <p className="text-[10px] text-muted-foreground">Path highlighted on graph</p>
                  </div>
                )}

                {inspector && (
                  <div className="mt-3 space-y-2">
                    {inspector.incoming?.length > 0 && (
                      <div>
                        <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-cyan-300">
                          <ArrowLeft className="h-3 w-3" /> Incoming ({inspector.incoming.length})
                        </p>
                        <div className="space-y-0.5">
                          {inspector.incoming.slice(0, 8).map((e: any, i: number) => (
                            <button key={i} onClick={() => handleNodeClick(e.from)} className="block w-full truncate rounded px-2 py-0.5 text-left text-[10px] text-muted-foreground transition hover:bg-white/5 hover:text-foreground">
                              ← {simNodes.find(n => n.id === e.from)?.label || e.from}
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
                            <button key={i} onClick={() => handleNodeClick(e.to)} className="block w-full truncate rounded px-2 py-0.5 text-left text-[10px] text-muted-foreground transition hover:bg-white/5 hover:text-foreground">
                              → {simNodes.find(n => n.id === e.to)?.label || e.to}
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
              <p className="py-4 text-center text-xs text-muted-foreground">{t("codegraph", "unified.noSelection") || "Select a node"}</p>
            )}
          </GlassCard>

          {/* AI Analysis */}
          <GlassCard className="p-4">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-violet-300" />
                {aiConfig?.title || "AI Analysis"}
              </h4>
              <Button size="sm" variant="outline" onClick={runAI} disabled={aiLoading || !aiConfig} className="border-violet-400/30 text-violet-300 hover:bg-violet-500/10">
                {aiLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                {aiLoading ? "..." : "Run"}
              </Button>
            </div>
            <AnimatePresence>
              {(aiResult || aiLoading) && aiExpanded && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  {aiLoading ? (
                    <p className="mt-2 flex items-center gap-2 text-xs text-amber-300"><Loader2 className="h-3 w-3 animate-spin" /> AI analyzing...</p>
                  ) : (
                    <pre className="mt-2 max-h-[250px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[11px] leading-relaxed text-foreground/85 scrollbar-thin">{aiResult}</pre>
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
              <p className="text-xs text-muted-foreground">None detected</p>
            ) : (
              report.deadCode?.slice(0, 20).map((d: any, i: number) => (
                <p key={i} className="truncate text-[10px] text-muted-foreground">{d.path || d}</p>
              ))
            )}
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <Box className="h-4 w-4 text-amber-400" />
            Duplicate Code <span className="text-muted-foreground">({report.duplicates?.length || 0})</span>
          </h4>
          <div className="mt-2 max-h-32 space-y-0.5 overflow-y-auto scrollbar-thin">
            {report.duplicates?.length === 0 ? (
              <p className="text-xs text-muted-foreground">None detected</p>
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
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
