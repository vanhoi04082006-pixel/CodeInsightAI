// CodeInsight AI — Diagram Renderer v2 (Enterprise)
//
// Interactive SVG renderer with:
// - Smooth zoom/pan (wheel + drag)
// - Hover/selected state with highlight
// - Focus mode (show only selected + neighbors)
// - Search highlight with pulse
// - MiniMap with viewport indicator
// - Stats overlay
// - Click node → callback

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { Diagram, DiagramNode, DiagramEdge } from "./types";
import { computeViewBox } from "./diagram-layout";

const NODE_COLORS: Record<string, string> = {
  class: "#a78bfa", interface: "#22d3ee", actor: "#34d399", entity: "#f472b6",
  layer: "#fbbf24", module: "#60a5fa", component: "#fb923c", lifeline: "#64748b",
};

const EDGE_COLORS: Record<string, string> = {
  extends: "#a78bfa", implements: "#22d3ee", composition: "#f472b6",
  aggregation: "#fb923c", dependency: "#64748b", association: "#34d399",
  call: "#22d3ee", message: "#34d399", relation: "#f472b6",
  import: "#60a5fa", renders: "#fb923c",
};

interface RendererProps {
  diagram: Diagram;
  selected?: string | null;
  onSelect?: (nodeId: string | null) => void;
  searchQuery?: string;
  focusMode?: boolean;
}

export function DiagramRenderer({ diagram, selected, onSelect, searchQuery, focusMode }: RendererProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { width: vbW, height: vbH } = computeViewBox(diagram);

  // Compute connected nodes (for focus mode + dim)
  const connectedIds = useMemo(() => {
    if (!selected) return new Set<string>();
    const ids = new Set<string>([selected]);
    for (const e of diagram.edges) {
      if (e.source === selected) ids.add(e.target);
      if (e.target === selected) ids.add(e.source);
    }
    return ids;
  }, [selected, diagram.edges]);

  // Search matches
  const searchMatches = useMemo(() => {
    if (!searchQuery?.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(diagram.nodes.filter(n =>
      n.label.toLowerCase().includes(q) || (n.sublabel?.toLowerCase().includes(q) ?? false)
    ).map(n => n.id));
  }, [searchQuery, diagram.nodes]);

  // Pan handlers
  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPan({
        x: dragRef.current.px + (e.clientX - dragRef.current.x),
        y: dragRef.current.py + (e.clientY - dragRef.current.y),
      });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.max(0.3, Math.min(4, z + delta)));
  };

  const fitToScreen = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Node visibility (focus mode)
  const visibleNodes = focusMode && selected
    ? diagram.nodes.filter(n => connectedIds.has(n.id))
    : diagram.nodes;
  const visibleEdges = focusMode && selected
    ? diagram.edges.filter(e => connectedIds.has(e.source) && connectedIds.has(e.target))
    : diagram.edges;

  // Collect unique edge colors for arrow markers
  const edgeColors = useMemo(() => {
    const s = new Set<string>();
    for (const e of visibleEdges) s.add(EDGE_COLORS[e.type] || "#64748b");
    return [...s];
  }, [visibleEdges]);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${vbW} ${vbH}`}
        width="100%"
        className="cursor-grab active:cursor-grabbing select-none"
        style={{ maxHeight: 450, touchAction: "none" }}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
      >
        <defs>
          {edgeColors.map(c => (
            <marker key={c} id={`dr-arrow-${c.replace("#", "")}`} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill={c} opacity={0.7} />
            </marker>
          ))}
        </defs>

        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {visibleEdges.map((e, i) => {
            const from = diagram.layout?.get(e.source);
            const to = diagram.layout?.get(e.target);
            if (!from || !to) return null;
            const color = EDGE_COLORS[e.type] || "#64748b";
            const isDimmed = selected && !connectedIds.has(e.source) && !connectedIds.has(e.target);
            const isInPath = selected && (e.source === selected || e.target === selected);
            const x1 = from.x + from.width / 2;
            const y1 = from.y + from.height;
            const x2 = to.x + to.width / 2;
            const y2 = to.y;
            const midY = (y1 + y2) / 2;
            const dashed = e.metadata?.dashed || e.type === "dependency" || e.type === "implements";

            return (
              <g key={i} style={{ opacity: isDimmed ? 0.1 : 1, transition: "opacity 0.2s" }}>
                <path
                  d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                  fill="none"
                  stroke={isInPath ? "#22d3ee" : color}
                  strokeWidth={isInPath ? 2 : 1.5}
                  strokeOpacity={0.6}
                  strokeDasharray={dashed ? "4 3" : undefined}
                  markerEnd={`url(#dr-arrow-${(isInPath ? "#22d3ee" : color).replace("#", "")})`}
                />
                {e.label && (
                  <text x={(x1 + x2) / 2} y={midY - 4} textAnchor="middle" fontSize={8} fill={color} className="pointer-events-none">
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {visibleNodes.map(n => {
            const pos = diagram.layout?.get(n.id);
            if (!pos) return null;
            const color = NODE_COLORS[n.type] || "#94a3b8";
            const isSel = selected === n.id;
            const isHover = hovered === n.id;
            const isConn = connectedIds.has(n.id);
            const isDimmed = selected && !isSel && !isConn;
            const isSearchMatch = searchMatches.has(n.id);
            const attrs = n.metadata?.attributes ?? [];
            const methods = n.metadata?.methods ?? [];
            const headerH = 24;
            const lineH = 12;

            return (
              <g
                key={n.id}
                transform={`translate(${pos.x} ${pos.y})`}
                style={{ opacity: isDimmed ? 0.15 : 1, transition: "opacity 0.2s", cursor: "pointer" }}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={(e) => { e.stopPropagation(); onSelect?.(isSel ? null : n.id); }}
              >
                {/* Search pulse */}
                {isSearchMatch && (
                  <rect x={-4} y={-4} width={pos.width + 8} height={pos.height + 8} rx={8}
                    fill="none" stroke="#fbbf24" strokeWidth={2} strokeDasharray="3 2" className="animate-pulse" />
                )}
                {/* Hover/selected glow */}
                {(isHover || isSel) && (
                  <rect x={-3} y={-3} width={pos.width + 6} height={pos.height + 6} rx={8}
                    fill={isSel ? "#22d3ee" : color} opacity={0.1} />
                )}
                {/* Background */}
                <rect width={pos.width} height={pos.height} rx={6}
                  fill={`${color}10`} stroke={isSel ? "#22d3ee" : color} strokeWidth={isSel ? 2 : 1.5} />
                {/* Header */}
                <rect width={pos.width} height={headerH} rx={6} fill={`${color}25`} />
                {n.metadata?.isAbstract && (
                  <text x={8} y={16} fontSize={10} fill={color} fontStyle="italic" fontWeight="bold">«abstract»</text>
                )}
                <text x={pos.width / 2} y={16} textAnchor="middle" fontSize={11} fontWeight="bold" fill={isSel ? "#22d3ee" : color}>
                  {n.label}
                </text>
                {n.sublabel && (
                  <text x={pos.width / 2} y={28} textAnchor="middle" fontSize={8} fill="#64748b">{n.sublabel}</text>
                )}
                {/* Attributes */}
                {attrs.length > 0 && (
                  <g transform={`translate(0 ${headerH})`}>
                    <line x1={0} y1={0} x2={pos.width} y2={0} stroke={color} strokeWidth={0.5} opacity={0.3} />
                    {attrs.slice(0, 5).map((a, i) => (
                      <text key={i} x={8} y={12 + i * lineH} fontSize={9} fill="#cbd5e1" fontFamily="monospace">{a}</text>
                    ))}
                  </g>
                )}
                {/* Methods */}
                {methods.length > 0 && (
                  <g transform={`translate(0 ${headerH + attrs.length * lineH + (attrs.length > 0 ? 4 : 0)})`}>
                    {attrs.length > 0 && <line x1={0} y1={0} x2={pos.width} y2={0} stroke={color} strokeWidth={0.5} opacity={0.3} />}
                    {methods.slice(0, 4).map((m, i) => (
                      <text key={i} x={8} y={12 + i * lineH} fontSize={9} fill="#86efac" fontFamily="monospace">{m}</text>
                    ))}
                  </g>
                )}
                {/* PK badge */}
                {n.metadata?.primaryKey && (
                  <circle cx={pos.width - 8} cy={8} r={4} fill="#fbbf24" stroke="#1e293b" strokeWidth={1} />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button onClick={() => setZoom(z => Math.min(4, z + 0.2))} className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-popover/90 text-foreground backdrop-blur-sm transition hover:bg-white/10 text-sm">+</button>
        <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-popover/90 text-foreground backdrop-blur-sm transition hover:bg-white/10 text-sm">−</button>
        <button onClick={fitToScreen} className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-popover/90 text-foreground backdrop-blur-sm transition hover:bg-white/10 text-xs">⊡</button>
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-2 right-2 rounded-lg border border-white/10 bg-popover/90 px-2 py-1 text-[9px] text-muted-foreground backdrop-blur-sm">
        {Math.round(zoom * 100)}%
      </div>

      {/* MiniMap */}
      {diagram.nodes.length > 0 && diagram.layout && (
        <div className="absolute bottom-2 left-2 hidden rounded-lg border border-white/10 bg-black/60 p-1 backdrop-blur-md sm:block">
          <svg viewBox={`0 0 ${vbW} ${vbH}`} className="h-16 w-20">
            {diagram.nodes.slice(0, 100).map(n => {
              const pos = diagram.layout?.get(n.id);
              if (!pos) return null;
              const color = NODE_COLORS[n.type] || "#94a3b8";
              return <rect key={n.id} x={pos.x} y={pos.y} width={3} height={3} fill={color} opacity={0.6} />;
            })}
            {/* Viewport indicator */}
            <rect
              x={-pan.x / zoom} y={-pan.y / zoom}
              width={vbW / zoom} height={vbH / zoom}
              fill="none" stroke="#22d3ee" strokeWidth={2} opacity={0.5}
            />
          </svg>
        </div>
      )}
    </div>
  );
}

/** Export diagram as Mermaid text */
export function toMermaid(diagram: Diagram): string {
  const lines: string[] = [];
  const typeMap: Record<string, string> = {
    uml: "classDiagram", sequence: "sequenceDiagram", erd: "erDiagram",
    architecture: "graph TB", module: "graph LR", component: "graph TB",
  };
  lines.push(typeMap[diagram.type] || "graph TB");
  if (diagram.type === "sequence") {
    for (const n of diagram.nodes) lines.push(`participant ${n.label}`);
    for (const e of diagram.edges) {
      const src = diagram.nodes.find(n => n.id === e.source)?.label || e.source;
      const tgt = diagram.nodes.find(n => n.id === e.target)?.label || e.target;
      lines.push(`${src} ->> ${tgt}: ${e.label || e.type}`);
    }
  } else {
    for (const n of diagram.nodes) lines.push(`  ${n.id}["${n.label}"]`);
    for (const e of diagram.edges) {
      const arrow = e.metadata?.dashed ? "-.->" : "-->";
      lines.push(`  ${e.source} ${arrow} ${e.target}${e.label ? ` : ${e.label}` : ""}`);
    }
  }
  return lines.join("\n");
}
