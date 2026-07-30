// CodeInsight AI — Diagram Layout Registry
// Plugin-friendly: register new layouts without modifying engine.
// Built-in: dagre-TB, dagre-LR, circular, force.

import type { Diagram } from "./types";
import dagre from "dagre";

export type LayoutType = "dagre-tb" | "dagre-lr" | "circular" | "force";

export interface LayoutResult {
  layout: Map<string, { x: number; y: number; width: number; height: number }>;
  width: number;
  height: number;
}

export type LayoutFn = (diagram: Diagram) => LayoutResult;

// ─── Registry ───

const REGISTRY = new Map<LayoutType, LayoutFn>();

export function registerLayout(type: LayoutType, fn: LayoutFn): void {
  REGISTRY.set(type, fn);
}

export function getLayoutFn(type: LayoutType): LayoutFn | undefined {
  return REGISTRY.get(type);
}

export function getAvailableLayouts(): LayoutType[] {
  return [...REGISTRY.keys()];
}

// ─── Dagre layouts ───

const NODE_W = 180;
const NODE_H = 70;
const RANK_SEP = 80;
const NODE_SEP = 40;

function dagreLayout(direction: "TB" | "LR"): LayoutFn {
  return (diagram: Diagram): LayoutResult => {
    if (diagram.nodes.length === 0) return { layout: new Map(), width: 400, height: 300 };
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: direction, ranksep: RANK_SEP, nodesep: NODE_SEP, marginx: 20, marginy: 20 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of diagram.nodes) {
      const extra = (n.metadata?.attributes?.length ?? 0) + (n.metadata?.methods?.length ?? 0);
      const h = NODE_H + Math.min(extra * 12, 80);
      g.setNode(n.id, { width: NODE_W, height: h });
    }
    for (const e of diagram.edges) g.setEdge(e.source, e.target);
    dagre.layout(g);
    const layout = new Map<string, { x: number; y: number; width: number; height: number }>();
    let maxX = 0, maxY = 0;
    for (const n of diagram.nodes) {
      const pos = g.node(n.id);
      if (pos) {
        const extra = (n.metadata?.attributes?.length ?? 0) + (n.metadata?.methods?.length ?? 0);
        const h = NODE_H + Math.min(extra * 12, 80);
        const x = pos.x - NODE_W / 2;
        const y = pos.y - h / 2;
        layout.set(n.id, { x, y, width: NODE_W, height: h });
        maxX = Math.max(maxX, x + NODE_W);
        maxY = Math.max(maxY, y + h);
      }
    }
    return { layout, width: maxX + 40, height: maxY + 40 };
  };
}

// ─── Circular layout ───

function circularLayout(diagram: Diagram): LayoutResult {
  if (diagram.nodes.length === 0) return { layout: new Map(), width: 400, height: 300 };
  const n = diagram.nodes.length;
  const radius = Math.max(120, n * 12);
  const cx = radius + 100;
  const cy = radius + 100;
  const layout = new Map<string, { x: number; y: number; width: number; height: number }>();
  diagram.nodes.forEach((node, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius - NODE_W / 2;
    const y = cy + Math.sin(angle) * radius - NODE_H / 2;
    layout.set(node.id, { x, y, width: NODE_W, height: NODE_H });
  });
  return { layout, width: cx + radius + 60, height: cy + radius + 60 };
}

// ─── Force layout (simple physics, no d3-force dependency) ───

function forceLayout(diagram: Diagram): LayoutResult {
  if (diagram.nodes.length === 0) return { layout: new Map(), width: 400, height: 300 };
  const positions = diagram.nodes.map((n, i) => {
    const angle = (i / diagram.nodes.length) * Math.PI * 2;
    return { id: n.id, x: 300 + Math.cos(angle) * 150, y: 250 + Math.sin(angle) * 150, vx: 0, vy: 0 };
  });
  const posMap = new Map(positions.map(p => [p.id, p]));
  const nodeMap = new Map(diagram.nodes.map(n => [n.id, n]));

  const charge = -200, linkDist = 120, damping = 0.85;
  for (let iter = 0; iter < 200; iter++) {
    // Repulsion
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i], b = positions[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d2 = dx * dx + dy * dy; if (d2 < 1) d2 = 1;
        const d = Math.sqrt(d2);
        const f = charge / d2;
        a.vx -= (dx / d) * f; a.vy -= (dy / d) * f;
        b.vx += (dx / d) * f; b.vy += (dy / d) * f;
      }
    }
    // Link springs
    for (const e of diagram.edges) {
      const a = posMap.get(e.source), b = posMap.get(e.target);
      if (!a || !b) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.sqrt(dx * dx + dy * dy); if (d < 0.01) d = 0.01;
      const f = (d - linkDist) * 0.15;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    // Apply
    for (const p of positions) {
      p.vx *= damping; p.vy *= damping;
      p.x += p.vx; p.y += p.vy;
      p.x = Math.max(20, Math.min(580, p.x));
      p.y = Math.max(20, Math.min(480, p.y));
    }
  }
  const layout = new Map<string, { x: number; y: number; width: number; height: number }>();
  let maxX = 0, maxY = 0;
  for (const p of positions) {
    const x = p.x - NODE_W / 2, y = p.y - NODE_H / 2;
    layout.set(p.id, { x, y, width: NODE_W, height: NODE_H });
    maxX = Math.max(maxX, x + NODE_W);
    maxY = Math.max(maxY, y + NODE_H);
  }
  return { layout, width: maxX + 40, height: maxY + 40 };
}

// ─── Register built-in layouts ───

registerLayout("dagre-tb", dagreLayout("TB"));
registerLayout("dagre-lr", dagreLayout("LR"));
registerLayout("circular", circularLayout);
registerLayout("force", forceLayout);

// ─── Public API ───

export function layoutDiagram(diagram: Diagram, type: LayoutType = "dagre-tb"): Diagram {
  const fn = getLayoutFn(type);
  if (!fn) return diagram;
  const result = fn(diagram);
  return { ...diagram, layout: result.layout, metadata: { ...diagram.metadata, _viewBox: { width: result.width, height: result.height } } };
}

export function computeViewBox(diagram: Diagram): { width: number; height: number } {
  const vb = diagram.metadata?._viewBox;
  if (vb) return vb;
  if (!diagram.layout || diagram.layout.size === 0) return { width: 600, height: 400 };
  let maxX = 0, maxY = 0;
  for (const [, pos] of diagram.layout) {
    maxX = Math.max(maxX, pos.x + pos.width);
    maxY = Math.max(maxY, pos.y + pos.height);
  }
  return { width: Math.max(maxX + 40, 400), height: Math.max(maxY + 40, 300) };
}

export const LAYOUT_OPTIONS: { type: LayoutType; label: string; icon: string }[] = [
  { type: "dagre-tb", label: "Hierarchy ↓", icon: "↓" },
  { type: "dagre-lr", label: "Hierarchy →", icon: "→" },
  { type: "circular", label: "Circular", icon: "◯" },
  { type: "force", label: "Force", icon: "✦" },
];
