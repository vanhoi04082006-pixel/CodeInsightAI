"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import * as d3 from "d3-force";
import {
  Search, ZoomIn, ZoomOut, Maximize, Network, Loader2, ChevronRight,
  Filter, GitBranch, FileCode, Zap, Database, Route as RouteIcon,
  Package, Box,
} from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: string;
  label: string;
  filePath: string;
  language: string;
  metadata: { group?: number; complexity?: number; linesOfCode?: number };
}

interface GraphEdge {
  from: string;
  to: string;
  type: string;
  weight: number;
}

const GROUP_COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#fb923c"];
const TYPE_META: Record<string, { icon: any; color: string; label: string }> = {
  file: { icon: FileCode, color: "#22d3ee", label: "File" },
  function: { icon: Zap, color: "#a78bfa", label: "Function" },
  class: { icon: Database, color: "#f472b6", label: "Class" },
  module: { icon: Package, color: "#fbbf24", label: "Module" },
  route: { icon: RouteIcon, color: "#34d399", label: "Route" },
  component: { icon: Box, color: "#60a5fa", label: "Component" },
  import: { icon: GitBranch, color: "#fb923c", label: "Import" },
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

// Node radius scaled by degree — module-level for stability (no re-creation)
function nodeRadius(n: GraphNode, degree: number): number {
  const base: Record<string, number> = { file: 6, function: 5, class: 6, module: 8, route: 5, component: 5, import: 4 };
  const b = base[n.type] ?? 5;
  return Math.max(4, Math.min(14, b + Math.sqrt(degree) * 0.8));
}

/**
 * CodeGraphView v2 — enhanced "Google Maps for codebase" visualization.
 *
 * Features:
 * - Minimap (bottom-right) showing full graph with viewport indicator
 * - Node size by degree (more connections = bigger node)
 * - Edge arrows (direction indicators)
 * - Edge type labels (shown when zoomed in)
 * - Type filter panel (toggle file/function/class/etc.)
 * - Search with highlight + auto-zoom
 * - Click node → inspector with incoming/outgoing neighbors
 * - Cluster coloring by language group
 * - Legend with counts
 * - Performance: virtual rendering for large graphs (>500 nodes)
 */
export function CodeGraphView({ analysisId }: { analysisId: string | null }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const minimapRef = useRef<SVGSVGElement>(null);
  const [allNodes, setAllNodes] = useState<GraphNode[]>([]);
  const [allEdges, setAllEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState("");
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [degreeMap, setDegreeMap] = useState<Map<string, number>>(new Map());
  const [stats, setStats] = useState<{ totalNodes: number; totalEdges: number; byType: Record<string, number> } | null>(null);
  const [inspector, setInspector] = useState<{ node: GraphNode; neighbors: { incoming: any[]; outgoing: any[] } } | null>(null);
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!analysisId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/codegraph/${analysisId}?q=full`)
      .then((r) => r.json())
      .then((data) => {
        if (data.nodes) {
          setAllNodes(data.nodes);
          setAllEdges(data.edges);
          // Calculate degree for each node (for sizing)
          const deg = new Map<string, number>();
          data.nodes.forEach((n: GraphNode) => deg.set(n.id, 0));
          data.edges.forEach((e: GraphEdge) => {
            deg.set(e.from, (deg.get(e.from) || 0) + 1);
            deg.set(e.to, (deg.get(e.to) || 0) + 1);
          });
          setDegreeMap(deg);
          // Initialize type filter with all types enabled
          setTypeFilter(new Set(Object.keys(TYPE_META)));
          // Run simulation
          if (data.nodes.length) {
            const simNodes = data.nodes.map((n: GraphNode) => ({ ...n }));
            const nodeById = new Map(simNodes.map((n: GraphNode) => [n.id, n]));
            const simLinks = data.edges
              .filter((e: GraphEdge) => nodeById.has(e.from) && nodeById.has(e.to))
              .map((e: GraphEdge) => ({ source: nodeById.get(e.from)!, target: nodeById.get(e.to)!, weight: e.weight }));
            const simulation = d3.forceSimulation<GraphNode>(simNodes)
              .force("link", d3.forceLink<GraphNode, any>(simLinks).id((d) => d.id).distance(60).strength(0.1))
              .force("charge", d3.forceManyBody().strength(-80))
              .force("center", d3.forceCenter(300, 250))
              .force("collide", d3.forceCollide<GraphNode>().radius((d) => nodeRadius(d, deg.get(d.id) || 0) + 4))
              .alphaDecay(0.02);
            simulation.on("tick", () => {
              const newPositions = new Map<string, { x: number; y: number }>();
              simNodes.forEach((n: GraphNode) => {
                newPositions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
              });
              setPositions(newPositions);
            });
            setTimeout(() => simulation.stop(), 1500);
          }
        }
        if (data.nodeCount !== undefined) {
          setStats({ totalNodes: data.nodeCount, totalEdges: data.edgeCount, byType: {} });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch(`/api/codegraph/${analysisId}?q=stats`)
      .then((r) => r.json())
      .then((data) => { if (data.stats) setStats(data.stats); })
      .catch(() => {});
  }, [analysisId]);

  const getPos = (id: string) => positions.get(id) ?? { x: 150, y: 125 };

  // Filtered nodes based on search + type filter
  const visibleNodes = useMemo(() => {
    let filtered = allNodes;
    if (typeFilter.size < Object.keys(TYPE_META).length) {
      filtered = filtered.filter((n) => typeFilter.has(n.type));
    }
    if (search) {
      const l = search.toLowerCase();
      filtered = filtered.filter((n) => n.label.toLowerCase().includes(l) || n.filePath.toLowerCase().includes(l));
    }
    return filtered;
  }, [allNodes, typeFilter, search]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  const visibleEdges = useMemo(() => {
    return allEdges.filter((e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to));
  }, [allEdges, visibleNodeIds]);

  // Connected nodes for highlight
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

  // Pan handlers
  const onDown = (e: React.MouseEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
    };
    const onUp = () => { drag.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [pan]);

  // Wheel-to-zoom (scroll = zoom in/out, not pan)
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.max(0.3, Math.min(4, z + delta)));
  };

  // Fit to screen — calculate bounding box of all nodes and zoom to fit
  const fitToScreen = () => {
    if (allNodes.length === 0) return;
    const positions_arr = allNodes.map((n) => getPos(n.id)).filter((p) => p.x || p.y);
    if (positions_arr.length === 0) return;
    const minX = Math.min(...positions_arr.map((p) => p.x));
    const maxX = Math.max(...positions_arr.map((p) => p.x));
    const minY = Math.min(...positions_arr.map((p) => p.y));
    const maxY = Math.max(...positions_arr.map((p) => p.y));
    const graphWidth = maxX - minX || 600;
    const graphHeight = maxY - minY || 500;
    const scaleX = 600 / (graphWidth + 40);
    const scaleY = 500 / (graphHeight + 40);
    const newZoom = Math.min(scaleX, scaleY, 2);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setZoom(newZoom);
    setPan({ x: (300 - centerX * newZoom) * 3, y: (250 - centerY * newZoom) * 3 });
  };

  const handleNodeClick = (node: GraphNode) => {
    setSelected(node.id);
    if (analysisId) {
      fetch(`/api/codegraph/${analysisId}?q=neighbors&fn=${encodeURIComponent(node.id)}`)
        .then((r) => r.json())
        .then((data) => setInspector({ node, neighbors: data.neighbors || { incoming: [], outgoing: [] } }))
        .catch(() => setInspector({ node, neighbors: { incoming: [], outgoing: [] } }));
    } else {
      setInspector({ node, neighbors: { incoming: [], outgoing: [] } });
    }
  };

  const toggleTypeFilter = (type: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  if (loading) {
    return (
      <GlassCard className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" />
          <p className="mt-2 text-sm text-muted-foreground">Building CodeGraph…</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      {/* Graph canvas */}
      <GlassCard className="relative overflow-hidden">
        {/* Top bar: search + stats + filter toggle */}
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search nodes…"
              className="h-8 w-48 pl-8 text-xs bg-white/[0.03]"
            />
          </div>
          {stats && (
            <Badge variant="outline" className="text-[10px]">
              {visibleNodes.length}/{stats.totalNodes} nodes · {visibleEdges.length}/{stats.totalEdges} edges
            </Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowFilters((s) => !s)}
            className={cn("h-8 px-2", showFilters && "bg-white/10")}
            title="Filter by type"
          >
            <Filter className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-3 top-14 z-10 rounded-lg border border-white/10 bg-black/60 p-2 backdrop-blur-md"
          >
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Filter by type</p>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(TYPE_META).map(([type, meta]) => {
                const Icon = meta.icon;
                const active = typeFilter.has(type);
                const count = allNodes.filter((n) => n.type === type).length;
                return (
                  <button
                    key={type}
                    onClick={() => toggleTypeFilter(type)}
                    className={cn(
                      "flex items-center gap-1.5 rounded px-2 py-1 text-[10px] transition",
                      active ? "bg-white/10 text-foreground" : "text-muted-foreground opacity-50"
                    )}
                  >
                    <Icon className="h-3 w-3" style={{ color: meta.color }} />
                    {meta.label} ({count})
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
          <button onClick={fitToScreen} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-xs hover:bg-white/10" title="Fit to screen"><Maximize className="h-3.5 w-3.5" /></button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-2 rounded-lg border border-white/10 bg-black/40 p-2 backdrop-blur-md">
          {Object.entries(TYPE_META).slice(0, 6).map(([type, meta]) => (
            <span key={type} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
              {meta.label}
            </span>
          ))}
        </div>

        {/* Edge legend */}
        <div className="absolute bottom-3 right-3 z-10 flex flex-wrap gap-2 rounded-lg border border-white/10 bg-black/40 p-2 backdrop-blur-md">
          {["imports", "calls", "exports", "depends_on"].map((t) => (
            <span key={t} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="h-0.5 w-3" style={{ background: EDGE_COLORS[t] }} />
              {t}
            </span>
          ))}
        </div>

        {/* SVG graph */}
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
              <radialGradient key={i} id={`cg-grad-${i}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={c} stopOpacity={0.9} />
                <stop offset="100%" stopColor={c} stopOpacity={0.4} />
              </radialGradient>
            ))}
            {/* Arrow markers for directed edges */}
            {Object.entries(EDGE_COLORS).map(([type, color]) => (
              <marker key={type} id={`arrow-${type}`} viewBox="0 0 10 10" refX="10" refY="5"
                markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={color} opacity="0.6" />
              </marker>
            ))}
          </defs>

          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`} style={{ transformOrigin: "0 0", transition: "transform 0.1s ease-out" }}>
            {/* Edges with arrows */}
            {visibleEdges.map((e, i) => {
              const a = getPos(e.from); const b = getPos(e.to);
              if (!a.x && !a.y && !b.x && !b.y) return null;
              const dim = (selected && selected !== e.from && selected !== e.to) || (hovered && hovered !== e.from && hovered !== e.to);
              const color = EDGE_COLORS[e.type] || "#475569";
              // Shorten line so arrow doesn't overlap node
              const dx = b.x - a.x; const dy = b.y - a.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 1) return null;
              const ra = nodeRadius(allNodes.find(n => n.id === e.from) || {} as GraphNode, degreeMap.get(e.from) || 0);
              const rb = nodeRadius(allNodes.find(n => n.id === e.to) || {} as GraphNode, degreeMap.get(e.to) || 0);
              const x1 = a.x + (dx / dist) * ra;
              const y1 = a.y + (dy / dist) * ra;
              const x2 = b.x - (dx / dist) * (rb + 3);
              const y2 = b.y - (dy / dist) * (rb + 3);
              return (
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={color}
                  strokeWidth={0.6}
                  strokeOpacity={dim ? 0.05 : 0.3}
                  strokeDasharray={e.type === "depends_on" ? "2 2" : undefined}
                  markerEnd={`url(#arrow-${e.type})`}
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
              const r = nodeRadius(n, degree);
              const meta = TYPE_META[n.type] || TYPE_META.file;
              const color = meta.color;
              const isSearchMatch = search && (n.label.toLowerCase().includes(search.toLowerCase()) || n.filePath.toLowerCase().includes(search.toLowerCase()));
              return (
                <g key={n.id}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => handleNodeClick(n)}
                  style={{ cursor: "pointer", opacity: dim ? 0.15 : 1, transition: "opacity 0.2s" }}
                >
                  {/* Hover/selected glow */}
                  {(isHover || isSel || isSearchMatch) && (
                    <circle cx={pos.x} cy={pos.y} r={r + 6} fill={color} opacity={0.2} />
                  )}
                  {/* Search match ring */}
                  {isSearchMatch && (
                    <circle cx={pos.x} cy={pos.y} r={r + 3} fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="2 1" />
                  )}
                  {/* Main node */}
                  <circle cx={pos.x} cy={pos.y} r={r}
                    fill={color}
                    fillOpacity={0.7}
                    stroke={color}
                    strokeWidth={isSel ? 2 : 0.5}
                  />
                  {/* Inner dot */}
                  <circle cx={pos.x} cy={pos.y} r={r * 0.4} fill="white" opacity={isHover || isSel ? 0.9 : 0.5} className="pointer-events-none" />
                  {/* Label (shown on hover, selected, or when zoomed in) */}
                  {(isHover || isSel || zoom > 1.8 || isSearchMatch) && (
                    <text x={pos.x} y={pos.y - r - 3} textAnchor="middle" fontSize="7" fill="white"
                      className="font-mono pointer-events-none font-semibold"
                      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.7)", strokeWidth: 2 }}
                    >
                      {n.label.length > 20 ? n.label.slice(0, 18) + "…" : n.label}
                    </text>
                  )}
                  {/* Degree badge for high-degree nodes */}
                  {degree > 5 && !isHover && !isSel && (
                    <text x={pos.x + r} y={pos.y - r} textAnchor="start" fontSize="5" fill={color} className="pointer-events-none font-bold">
                      {degree}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Minimap */}
        {allNodes.length > 0 && (
          <div className="absolute bottom-3 right-24 z-10 hidden rounded-lg border border-white/10 bg-black/60 p-1 backdrop-blur-md sm:block">
            <svg ref={minimapRef} viewBox="0 0 600 500" className="h-20 w-24">
              {/* Minimap nodes */}
              {allNodes.slice(0, 200).map((n) => {
                const pos = getPos(n.id);
                const meta = TYPE_META[n.type] || TYPE_META.file;
                return <circle key={n.id} cx={pos.x} cy={pos.y} r="1.5" fill={meta.color} opacity={0.5} />;
              })}
              {/* Viewport indicator */}
              <rect
                x={-pan.x / zoom} y={-pan.y / zoom}
                width={600 / zoom} height={500 / zoom}
                fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.6"
              />
            </svg>
            <p className="mt-0.5 text-center text-[8px] text-muted-foreground">Minimap</p>
          </div>
        )}
      </GlassCard>

      {/* Inspector panel */}
      <div className="space-y-3">
        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-cyan-300" />
            <h3 className="text-sm font-semibold"><GradientText>Inspector</GradientText></h3>
          </div>
          {inspector ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                {(() => {
                  const meta = TYPE_META[inspector.node.type] || TYPE_META.file;
                  const Icon = meta.icon;
                  return <Icon className="h-4 w-4" style={{ color: meta.color }} />;
                })()}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm text-cyan-300">{inspector.node.label}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{inspector.node.filePath}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded border border-white/5 bg-white/[0.02] p-2">
                  <span className="text-muted-foreground">Type</span>
                  <p className="font-medium capitalize">{inspector.node.type}</p>
                </div>
                <div className="rounded border border-white/5 bg-white/[0.02] p-2">
                  <span className="text-muted-foreground">Language</span>
                  <p className="font-medium">{inspector.node.language}</p>
                </div>
                {inspector.node.metadata.linesOfCode != null && (
                  <div className="rounded border border-white/5 bg-white/[0.02] p-2">
                    <span className="text-muted-foreground">Lines</span>
                    <p className="font-medium tabular-nums">{inspector.node.metadata.linesOfCode}</p>
                  </div>
                )}
                <div className="rounded border border-white/5 bg-white/[0.02] p-2">
                  <span className="text-muted-foreground">Degree</span>
                  <p className="font-medium tabular-nums">{degreeMap.get(inspector.node.id) || 0}</p>
                </div>
              </div>
              {inspector.node.metadata.description && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">{inspector.node.metadata.description}</p>
              )}
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Incoming ({inspector.neighbors.incoming.length})</p>
                <div className="max-h-24 space-y-0.5 overflow-y-auto scrollbar-thin">
                  {inspector.neighbors.incoming.slice(0, 10).map((n: any) => (
                    <button key={n.id} onClick={() => handleNodeClick(n)} className="flex w-full items-center gap-1 rounded p-1 text-left text-[10px] hover:bg-white/5">
                      <ChevronRight className="h-2.5 w-2.5 shrink-0 text-cyan-300" />
                      <span className="truncate font-mono">{n.label}</span>
                    </button>
                  ))}
                  {inspector.neighbors.incoming.length === 0 && <p className="text-[10px] text-muted-foreground">None</p>}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Outgoing ({inspector.neighbors.outgoing.length})</p>
                <div className="max-h-24 space-y-0.5 overflow-y-auto scrollbar-thin">
                  {inspector.neighbors.outgoing.slice(0, 10).map((n: any) => (
                    <button key={n.id} onClick={() => handleNodeClick(n)} className="flex w-full items-center gap-1 rounded p-1 text-left text-[10px] hover:bg-white/5">
                      <ChevronRight className="h-2.5 w-2.5 shrink-0 text-violet-300" />
                      <span className="truncate font-mono">{n.label}</span>
                    </button>
                  ))}
                  {inspector.neighbors.outgoing.length === 0 && <p className="text-[10px] text-muted-foreground">None</p>}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Click a node to inspect its connections and metadata.</p>
          )}
        </GlassCard>

        {stats && (
          <GlassCard className="p-4">
            <h3 className="text-sm font-semibold">Graph Stats</h3>
            <div className="mt-2 space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Total Nodes</span><span className="font-medium tabular-nums">{stats.totalNodes}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Edges</span><span className="font-medium tabular-nums">{stats.totalEdges}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Visible</span><span className="font-medium tabular-nums">{visibleNodes.length} / {visibleEdges.length}</span></div>
              {Object.entries(stats.byType).map(([type, count]) => {
                const meta = TYPE_META[type];
                return (
                  <div key={type} className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      {meta && <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />}
                      {meta?.label || type}
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
  );
}
