"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import * as d3 from "d3-force";
import { Search, ZoomIn, ZoomOut, Maximize, Network, Loader2, ChevronRight } from "lucide-react";
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
const TYPE_ICONS: Record<string, string> = {
  file: "📄", function: "⚡", class: "🏛️", module: "📦", route: "🛣️", component: "🧩", import: "📥",
};

/**
 * CodeGraphView — interactive "Google Maps for codebase" visualization.
 * Features: pan/zoom, search, click-to-inspect, neighbor highlight, legend.
 */
export function CodeGraphView({ analysisId }: { analysisId: string | null }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState("");
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [stats, setStats] = useState<{ totalNodes: number; totalEdges: number; byType: Record<string, number> } | null>(null);
  const [inspector, setInspector] = useState<{ node: GraphNode; neighbors: { incoming: any[]; outgoing: any[] } } | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    if (!analysisId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/codegraph/${analysisId}?q=full`)
      .then((r) => r.json())
      .then((data) => {
        if (data.nodes) {
          setNodes(data.nodes);
          setEdges(data.edges);
          // Run simulation inline
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
              .force("collide", d3.forceCollide<GraphNode>().radius(10))
              .alphaDecay(0.02);
            simulation.on("tick", () => {
              const newPositions = new Map<string, { x: number; y: number }>();
              simNodes.forEach((n: GraphNode) => {
                newPositions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
              });
              setPositions(newPositions);
            });
            setTimeout(() => simulation.stop(), 3000);
          }
        }
        if (data.nodeCount !== undefined) {
          setStats({ totalNodes: data.nodeCount, totalEdges: data.edgeCount, byType: {} });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // Fetch stats
    fetch(`/api/codegraph/${analysisId}?q=stats`)
      .then((r) => r.json())
      .then((data) => { if (data.stats) setStats(data.stats); })
      .catch(() => {});
  }, [analysisId]);

  const getPos = (id: string) => positions.get(id) ?? { x: 150, y: 125 };

  // Filtered nodes based on search
  const filteredNodes = search
    ? nodes.filter((n) => n.label.toLowerCase().includes(search.toLowerCase()) || n.filePath.toLowerCase().includes(search.toLowerCase()))
    : nodes;

  // Connected nodes for highlight
  const connected = new Set<string>();
  if (selected) {
    edges.forEach((e) => {
      if (e.from === selected) connected.add(e.to);
      if (e.to === selected) connected.add(e.from);
    });
  }

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
  }, []);

  // Node radius by type
  const nodeRadius = (n: GraphNode) => {
    const base: Record<string, number> = { file: 8, function: 6, class: 7, module: 10, route: 6, component: 6, import: 5 };
    return base[n.type] ?? 6;
  };

  const handleNodeClick = (node: GraphNode) => {
    setSelected(node.id);
    // Fetch neighbors
    if (analysisId) {
      fetch(`/api/codegraph/${analysisId}?q=neighbors&fn=${encodeURIComponent(node.id)}`)
        .then((r) => r.json())
        .then((data) => {
          setInspector({ node, neighbors: data.neighbors || { incoming: [], outgoing: [] } });
        })
        .catch(() => setInspector({ node, neighbors: { incoming: [], outgoing: [] } }));
    } else {
      setInspector({ node, neighbors: { incoming: [], outgoing: [] } });
    }
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
        {/* Search bar */}
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
              {stats.totalNodes} nodes · {stats.totalEdges} edges
            </Badge>
          )}
        </div>

        {/* Zoom controls */}
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
          <button onClick={() => setZoom((z) => Math.min(3, z + 0.2))} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-sm hover:bg-white/10"><ZoomIn className="h-3.5 w-3.5" /></button>
          <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-sm hover:bg-white/10"><ZoomOut className="h-3.5 w-3.5" /></button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-xs hover:bg-white/10"><Maximize className="h-3.5 w-3.5" /></button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-2 rounded-lg border border-white/10 bg-black/40 p-2 backdrop-blur-md">
          {["File", "Function", "Class", "Module", "Route", "Component"].map((l, i) => (
            <span key={l} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }} />
              {l}
            </span>
          ))}
        </div>

        {/* SVG graph */}
        <svg
          ref={svgRef}
          viewBox="0 0 600 500"
          className="h-[500px] w-full cursor-grab active:cursor-grabbing"
          onMouseDown={onDown}
          style={{ touchAction: "none" }}
        >
          <defs>
            {GROUP_COLORS.map((c, i) => (
              <radialGradient key={i} id={`cg-grad-${i}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={c} stopOpacity={0.9} />
                <stop offset="100%" stopColor={c} stopOpacity={0.4} />
              </radialGradient>
            ))}
          </defs>

          <g transform={`translate(${pan.x / 3} ${pan.y / 3}) scale(${zoom})`} style={{ transformOrigin: "300px 250px" }}>
            {/* Edges */}
            {edges.map((e, i) => {
              const a = getPos(e.from); const b = getPos(e.to);
              if (!a.x && !a.y && !b.x && !b.y) return null;
              const dim = (selected && selected !== e.from && selected !== e.to) || (hovered && hovered !== e.from && hovered !== e.to);
              return (
                <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={e.type === "imports" ? "#67e8f9" : e.type === "calls" ? "#a78bfa" : "#475569"}
                  strokeWidth={0.5} strokeOpacity={dim ? 0.05 : 0.2}
                  strokeDasharray={e.type === "depends_on" ? "2 2" : undefined}
                />
              );
            })}

            {/* Nodes */}
            {filteredNodes.map((n) => {
              const pos = getPos(n.id);
              const isHover = hovered === n.id;
              const isSel = selected === n.id;
              const isConn = connected.has(n.id);
              const dim = (selected && !isSel && !isConn) || (hovered && !isHover && !isConn && hovered !== n.id);
              const r = nodeRadius(n);
              const color = GROUP_COLORS[(n.metadata.group ?? 0) % GROUP_COLORS.length];
              return (
                <g key={n.id}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => handleNodeClick(n)}
                  style={{ cursor: "pointer", opacity: dim ? 0.2 : 1, transition: "opacity 0.2s" }}
                >
                  {(isHover || isSel) && <circle cx={pos.x} cy={pos.y} r={r + 5} fill={color} opacity={0.15} />}
                  <circle cx={pos.x} cy={pos.y} r={r}
                    fill={`url(#cg-grad-${(n.metadata.group ?? 0) % GROUP_COLORS.length})`}
                    stroke={color} strokeWidth={isSel ? 2 : 0.5}
                  />
                  <circle cx={pos.x} cy={pos.y} r={r * 0.4} fill="white" opacity={isHover || isSel ? 0.9 : 0.5} className="pointer-events-none" />
                  {(isHover || isSel || zoom > 1.8) && (
                    <text x={pos.x} y={pos.y - r - 3} textAnchor="middle" fontSize="7" fill="white"
                      className="font-mono pointer-events-none font-semibold"
                      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.7)", strokeWidth: 2 }}
                    >
                      {n.label.length > 20 ? n.label.slice(0, 18) + "…" : n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
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
                <span className="text-lg">{TYPE_ICONS[inspector.node.type] || "📍"}</span>
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
                {inspector.node.metadata.complexity != null && (
                  <div className="rounded border border-white/5 bg-white/[0.02] p-2">
                    <span className="text-muted-foreground">Complexity</span>
                    <p className="font-medium tabular-nums">{inspector.node.metadata.complexity}</p>
                  </div>
                )}
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
              {Object.entries(stats.byType).map(([type, count]) => (
                <div key={type} className="flex justify-between"><span className="text-muted-foreground capitalize">{type}</span><span className="font-medium tabular-nums">{count}</span></div>
              ))}
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
