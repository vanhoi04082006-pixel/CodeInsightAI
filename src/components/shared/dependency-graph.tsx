"use client";

import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import * as d3 from "d3-force";
import type { AnalysisReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const GROUP_COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24"];

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: string;
  group: number;
  size: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  weight: number;
  circular?: boolean;
}

export function DependencyGraph({ report }: { report: AnalysisReport }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const { nodes, edges } = report.dependencies;
  const selNode = nodes.find((n) => n.id === selected);
  const connected = new Set<string>();
  if (selNode) {
    edges.forEach((e) => {
      if (e.from === selNode.id) connected.add(e.to);
      if (e.to === selNode.id) connected.add(e.from);
    });
  }

  // Run d3-force simulation on mount or when data changes
  useEffect(() => {
    if (!nodes.length) return;

    const simNodes: SimNode[] = nodes.map(n => ({
      id: n.id, label: n.label, type: n.type, group: n.group, size: n.size,
    }));
    const nodeById = new Map(simNodes.map(n => [n.id, n]));
    const simLinks: SimLink[] = edges
      .filter(e => nodeById.has(e.from) && nodeById.has(e.to))
      .map(e => ({
        source: nodeById.get(e.from)!,
        target: nodeById.get(e.to)!,
        weight: e.weight,
        circular: e.circular,
      }));

    const simulation = d3.forceSimulation<SimNode>(simNodes)
      .force("link", d3.forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance((d) => d.circular ? 80 : 50)
        .strength((d) => d.weight * 0.3))
      .force("charge", d3.forceManyBody().strength(-120))
      .force("center", d3.forceCenter(250, 200))
      .force("collide", d3.forceCollide<SimNode>().radius((d) => d.size + 4))
      .force("x", d3.forceX(250).strength(0.05))
      .force("y", d3.forceY(200).strength(0.05))
      .alphaDecay(0.02);

    // Run simulation for a fixed number of ticks (non-blocking)
    for (let i = 0; i < 300; i++) {
      simulation.tick();
    }
    simulation.stop();

    // Store final positions
    const posMap = new Map<string, { x: number; y: number }>();
    simNodes.forEach(n => {
      posMap.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodePositions(posMap);

    return () => {
      simulation.stop();
    };
  }, [nodes, edges]);

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
    const onUp = () => (drag.current = null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const getPos = (id: string) => nodePositions.get(id) ?? { x: 0, y: 0 };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      {/* Graph canvas */}
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30">
        <svg
          ref={svgRef}
          viewBox="0 0 500 400"
          className="h-[460px] w-full cursor-grab active:cursor-grabbing"
          onMouseDown={onDown}
          style={{ touchAction: "none" }}
        >
          <defs>
            <radialGradient id="bg-grad" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="rgba(34,211,238,0.05)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            {GROUP_COLORS.map((c, i) => (
              <radialGradient key={i} id={`node-grad-${i}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={c} stopOpacity={0.9} />
                <stop offset="100%" stopColor={c} stopOpacity={0.4} />
              </radialGradient>
            ))}
          </defs>
          <rect x="0" y="0" width="500" height="400" fill="url(#bg-grad)" />
          <g transform={`translate(${pan.x / 5} ${pan.y / 5}) scale(${zoom})`} style={{ transformOrigin: "250px 200px" }}>
            {/* Edges */}
            {edges.map((e, i) => {
              const a = getPos(e.from);
              const b = getPos(e.to);
              if (!a.x && !a.y && !b.x && !b.y) return null;
              const dim = (selected && selected !== e.from && selected !== e.to) || (hovered && hovered !== e.from && hovered !== e.to);
              return (
                <line
                  key={i}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={e.circular ? "#ff5470" : "#67e8f9"}
                  strokeWidth={e.circular ? 1.5 : 0.8}
                  strokeOpacity={dim ? 0.05 : e.weight * 0.15 + 0.1}
                  strokeDasharray={e.circular ? "3 2" : undefined}
                />
              );
            })}
            {/* Nodes */}
            {nodes.map((n) => {
              const pos = getPos(n.id);
              const isHover = hovered === n.id;
              const isSel = selected === n.id;
              const isConn = connected.has(n.id);
              const dim = (selected && !isSel && !isConn) || (hovered && !isHover && !connected.has(n.id) && hovered !== n.id);
              const color = GROUP_COLORS[n.group % GROUP_COLORS.length];
              return (
                <g
                  key={n.id}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelected(isSel ? null : n.id)}
                  style={{ cursor: "pointer", opacity: dim ? 0.2 : 1, transition: "opacity 0.2s" }}
                >
                  {(isHover || isSel) && (
                    <circle cx={pos.x} cy={pos.y} r={n.size / 8 + 3} fill={color} opacity={0.15} />
                  )}
                  <circle
                    cx={pos.x} cy={pos.y} r={n.size / 8}
                    fill={`url(#node-grad-${n.group % GROUP_COLORS.length})`}
                    stroke={color}
                    strokeWidth={isSel ? 1 : 0.5}
                  />
                  {(isHover || isSel || n.type === "entry") && (
                    <text
                      x={pos.x} y={pos.y - n.size / 8 - 2}
                      textAnchor="middle" fontSize="2.5" fill="white"
                      className="font-mono pointer-events-none"
                    >
                      {n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Controls */}
        <div className="absolute right-3 top-3 flex flex-col gap-1">
          <button onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-sm hover:bg-white/10">+</button>
          <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-sm hover:bg-white/10">−</button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-xs hover:bg-white/10">⤾</button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 rounded-lg border border-white/10 bg-black/40 p-2 backdrop-blur-md">
          {["Entry", "Core", "Service", "Util", "Component", "Config"].map((l, i) => (
            <span key={l} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }} />
              {l}
            </span>
          ))}
          <span className="flex items-center gap-1 text-[10px] text-rose-400">
            <span className="h-0.5 w-3 bg-rose-400" /> circular
          </span>
        </div>
      </div>

      {/* Inspector */}
      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Inspector</p>
          {selNode ? (
            <div className="mt-2 space-y-2">
              <p className="font-mono text-sm text-cyan-300">{selNode.label}</p>
              <p className="text-xs text-muted-foreground">Path: <span className="text-foreground">{selNode.id}</span></p>
              <p className="text-xs text-muted-foreground">Type: <span className="text-foreground">{selNode.type}</span></p>
              <p className="text-xs text-muted-foreground">Group: <span className="text-foreground">{selNode.group}</span></p>
              <p className="text-xs text-muted-foreground">Connections: <span className="text-foreground">{edges.filter((e) => e.from === selNode.id || e.to === selNode.id).length}</span></p>
              <p className="mt-2 text-xs leading-relaxed text-foreground/80">
                {NODE_EXPLANATIONS[selNode.type] || "Module in the codebase."}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Click a node to inspect its role and connections.</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Graph stats</p>
          <div className="mt-2 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Nodes</span>
              <span className="font-medium">{nodes.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Edges</span>
              <span className="font-medium">{edges.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Circular deps</span>
              <span className="font-medium" style={{ color: report.dependencies.circular.length ? "#ff5470" : undefined }}>
                {report.dependencies.circular.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Avg connectivity</span>
              <span className="font-medium">{nodes.length > 0 ? (edges.length / nodes.length).toFixed(2) : 0}</span>
            </div>
          </div>
        </div>

        {report.dependencies.circular.length > 0 && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
            <p className="text-[10px] uppercase tracking-wider text-rose-400">Circular dependencies</p>
            <div className="mt-2 space-y-1.5">
              {report.dependencies.circular.map((c, i) => (
                <div key={i} className="font-mono text-[11px] text-rose-300">
                  {c.nodes.join(" → ")}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const NODE_EXPLANATIONS: Record<string, string> = {
  entry: "Application entry point — bootstraps the runtime and mounts the app.",
  core: "Core domain module — encapsulates a primary business capability.",
  service: "Service layer — orchestrates use-cases and coordinates infrastructure calls.",
  util: "Shared utility — stateless helpers reused across modules.",
  component: "UI component — presentation logic with minimal business rules.",
  config: "Configuration — static settings, env loaders, and feature flags.",
};
