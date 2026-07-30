// CodeInsight AI — Diagram Renderer
// React component that renders a Diagram model as SVG.
// No string concatenation — pure React SVG elements from Diagram data.

import React from "react";
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

function NodeBox({ node, layout }: { node: DiagramNode; layout?: { x: number; y: number; width: number; height: number } }) {
  if (!layout) return null;
  const color = NODE_COLORS[node.type] || "#94a3b8";
  const attrs = node.metadata?.attributes ?? [];
  const methods = node.metadata?.methods ?? [];
  const headerH = 24;
  const lineH = 12;
  const contentH = layout.height - headerH;

  return (
    <g transform={`translate(${layout.x} ${layout.y})`}>
      {/* Background */}
      <rect width={layout.width} height={layout.height} rx={6}
        fill={`${color}10`} stroke={color} strokeWidth={1.5} />
      {/* Header */}
      <rect width={layout.width} height={headerH} rx={6}
        fill={`${color}25`} />
      {node.metadata?.isAbstract && (
        <text x={8} y={16} fontSize={10} fill={color} fontStyle="italic" fontWeight="bold">«abstract»</text>
      )}
      <text x={layout.width / 2} y={16} textAnchor="middle" fontSize={11} fontWeight="bold" fill={color}>
        {node.label}
      </text>
      {node.sublabel && (
        <text x={layout.width / 2} y={28} textAnchor="middle" fontSize={8} fill="#64748b">{node.sublabel}</text>
      )}
      {/* Attributes */}
      {attrs.length > 0 && (
        <g transform={`translate(0 ${headerH})`}>
          <line x1={0} y1={0} x2={layout.width} y2={0} stroke={color} strokeWidth={0.5} opacity={0.3} />
          {attrs.slice(0, 5).map((a, i) => (
            <text key={i} x={8} y={12 + i * lineH} fontSize={9} fill="#cbd5e1" fontFamily="monospace">{a}</text>
          ))}
        </g>
      )}
      {/* Methods */}
      {methods.length > 0 && (
        <g transform={`translate(0 ${headerH + attrs.length * lineH + (attrs.length > 0 ? 4 : 0)})`}>
          {attrs.length > 0 && <line x1={0} y1={0} x2={layout.width} y2={0} stroke={color} strokeWidth={0.5} opacity={0.3} />}
          {methods.slice(0, 4).map((m, i) => (
            <text key={i} x={8} y={12 + i * lineH} fontSize={9} fill="#86efac" fontFamily="monospace">{m}</text>
          ))}
        </g>
      )}
      {/* PK/FK badges for ERD */}
      {node.metadata?.primaryKey && (
        <circle cx={layout.width - 8} cy={8} r={4} fill="#fbbf24" stroke="#1e293b" strokeWidth={1} />
      )}
    </g>
  );
}

function EdgeLine({ edge, layout }: { edge: DiagramEdge; layout?: Map<string, { x: number; y: number; width: number; height: number }> }) {
  const from = layout?.get(edge.source);
  const to = layout?.get(edge.target);
  if (!from || !to) return null;
  const color = EDGE_COLORS[edge.type] || "#64748b";
  const x1 = from.x + from.width / 2;
  const y1 = from.y + from.height;
  const x2 = to.x + to.width / 2;
  const y2 = to.y;
  const midY = (y1 + y2) / 2;
  const dashed = edge.metadata?.dashed || edge.type === "dependency" || edge.type === "implements";

  return (
    <g>
      <path
        d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.6}
        strokeDasharray={dashed ? "4 3" : undefined}
        markerEnd={`url(#dia-arrow-${color.replace("#", "")})`}
      />
      {edge.label && (
        <text x={(x1 + x2) / 2} y={midY - 4} textAnchor="middle" fontSize={8} fill={color} className="pointer-events-none">
          {edge.label}
        </text>
      )}
    </g>
  );
}

export function DiagramRenderer({ diagram }: { diagram: Diagram }) {
  const { width, height } = computeViewBox(diagram);
  const colors = new Set<string>();
  for (const e of diagram.edges) {
    const c = EDGE_COLORS[e.type] || "#64748b";
    colors.add(c);
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" className="select-none" style={{ maxHeight: 500 }}>
      <defs>
        {[...colors].map(c => (
          <marker key={c} id={`dia-arrow-${c.replace("#", "")}`} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill={c} opacity={0.7} />
          </marker>
        ))}
      </defs>
      {/* Edges first (below nodes) */}
      {diagram.edges.map((e, i) => (
        <EdgeLine key={i} edge={e} layout={diagram.layout} />
      ))}
      {/* Nodes on top */}
      {diagram.nodes.map(n => (
        <NodeBox key={n.id} node={n} layout={diagram.layout?.get(n.id)} />
      ))}
    </svg>
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
    for (const n of diagram.nodes) {
      lines.push(`  ${n.id}["${n.label}"]`);
    }
    for (const e of diagram.edges) {
      const arrow = e.metadata?.dashed ? "-.->" : "-->";
      lines.push(`  ${e.source} ${arrow} ${e.target}${e.label ? ` : ${e.label}` : ""}`);
    }
  }
  return lines.join("\n");
}
