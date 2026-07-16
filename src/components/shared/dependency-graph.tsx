"use client";

import { motion } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import type { AnalysisReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const GROUP_COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24"];

export function DependencyGraph({ report }: { report: AnalysisReport }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
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

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      {/* Graph canvas */}
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30">
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
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
          <rect x="0" y="0" width="100" height="100" fill="url(#bg-grad)" />
          <g transform={`translate(${pan.x / 5} ${pan.y / 5}) scale(${zoom})`} style={{ transformOrigin: "50px 50px" }}>
            {/* edges */}
            {edges.map((e, i) => {
              const a = nodes.find((n) => n.id === e.from);
              const b = nodes.find((n) => n.id === e.to);
              if (!a || !b) return null;
              const dim = (selNode && selNode.id !== e.from && selNode.id !== e.to) || (hovered && hovered !== e.from && hovered !== e.to);
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={e.circular ? "#ff5470" : "#67e8f9"}
                  strokeWidth={e.circular ? 0.4 : 0.2}
                  strokeOpacity={dim ? 0.08 : e.weight * 0.18 + 0.12}
                  strokeDasharray={e.circular ? "1 1" : undefined}
                >
                  {!dim && (
                    <animate attributeName="stroke-opacity" values="0.1;0.35;0.1" dur="3s" begin={`${i * 0.1}s`} repeatCount="indefinite" />
                  )}
                </line>
              );
            })}
            {/* nodes */}
            {nodes.map((n) => {
              const isHover = hovered === n.id;
              const isSel = selected === n.id;
              const isConn = connected.has(n.id);
              const dim = (selNode && !isSel && !isConn) || (hovered && !isHover && !connected.has(n.id) && hovered !== n.id);
              const color = GROUP_COLORS[n.group % GROUP_COLORS.length];
              return (
                <g
                  key={n.id}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelected(isSel ? null : n.id)}
                  style={{ cursor: "pointer", opacity: dim ? 0.25 : 1, transition: "opacity 0.2s" }}
                >
                  {(isHover || isSel) && (
                    <circle cx={n.x} cy={n.y} r={n.size / 8 + 2.5} fill={color} opacity={0.15} />
                  )}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.size / 8}
                    fill={`url(#node-grad-${n.group % GROUP_COLORS.length})`}
                    stroke={color}
                    strokeWidth={isSel ? 0.5 : 0.2}
                  />
                  {(isHover || isSel || n.type === "entry") && (
                    <text
                      x={n.x}
                      y={n.y - n.size / 8 - 1.5}
                      textAnchor="middle"
                      fontSize="2"
                      fill="white"
                      className="font-mono"
                      style={{ pointerEvents: "none" }}
                    >
                      {n.label.split("/").pop()}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* controls */}
        <div className="absolute right-3 top-3 flex flex-col gap-1">
          <button onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-sm hover:bg-white/10">+</button>
          <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-sm hover:bg-white/10">−</button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-xs hover:bg-white/10">⤾</button>
        </div>

        {/* legend */}
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

      {/* inspector */}
      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Inspector</p>
          {selNode ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 space-y-2">
              <p className="font-mono text-sm text-cyan-300">{selNode.label}</p>
              <p className="text-xs text-muted-foreground">Type: <span className="text-foreground">{selNode.type}</span></p>
              <p className="text-xs text-muted-foreground">Module group: <span className="text-foreground">{selNode.group}</span></p>
              <p className="text-xs text-muted-foreground">Connections: <span className="text-foreground">{edges.filter((e) => e.from === selNode.id || e.to === selNode.id).length}</span></p>
              <p className="mt-2 text-xs leading-relaxed text-foreground/80">
                {NODE_EXPLANATIONS[selNode.type]}
              </p>
            </motion.div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Click a node to inspect its role and connections.</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Graph stats</p>
          <div className="mt-2 space-y-1.5 text-xs">
            <Row label="Nodes" value={nodes.length} />
            <Row label="Edges" value={edges.length} />
            <Row label="Circular deps" value={report.dependencies.circular.length} accent={report.dependencies.circular.length ? "#ff5470" : undefined} />
            <Row label="Avg. connectivity" value={(edges.length / nodes.length).toFixed(2)} />
          </div>
        </div>

        {report.dependencies.circular.length > 0 && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
            <p className="text-[10px] uppercase tracking-wider text-rose-400">Circular dependencies detected</p>
            <div className="mt-2 space-y-1.5">
              {report.dependencies.circular.map((c, i) => (
                <div key={i} className="font-mono text-[11px] text-rose-300">
                  {c.nodes.join(" → ")} → {c.nodes[0]}
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
  entry: "Application entry point. Bootstraps the runtime, mounts providers, and wires together the top-level modules.",
  core: "Core domain module. Encapsulates a primary business capability and exposes a stable public API to the rest of the app.",
  service: "Service layer. Orchestrates use-cases, applies business rules, and coordinates infrastructure calls.",
  util: "Shared utility. Stateless helpers reused across modules — keep these pure and side-effect free.",
  component: "UI component. Presentation logic with minimal business rules — communicates via props and events.",
  config: "Configuration. Static settings, environment loaders, and feature flags. Treat as the single source of truth.",
};

function Row({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums" style={{ color: accent }}>{value}</span>
    </div>
  );
}
