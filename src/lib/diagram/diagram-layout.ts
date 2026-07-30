// CodeInsight AI — Diagram Layout Engine
// Uses dagre for hierarchical layout (stable, no overlap, minimal crossings).

import dagre from "dagre";
import type { Diagram, DiagramNode } from "./types";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 70;
const RANK_SEP = 80;
const NODE_SEP = 40;

export function layoutDiagram(diagram: Diagram, direction: "LR" | "TB" = "TB"): Diagram {
  if (diagram.nodes.length === 0) return diagram;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes with computed sizes (taller if has attributes/methods)
  for (const n of diagram.nodes) {
    const extraLines = (n.metadata?.attributes?.length ?? 0) + (n.metadata?.methods?.length ?? 0);
    const height = NODE_HEIGHT + Math.min(extraLines * 12, 80);
    g.setNode(n.id, { width: NODE_WIDTH, height });
  }

  // Add edges
  for (const e of diagram.edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  // Build layout map
  const layout = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const n of diagram.nodes) {
    const pos = g.node(n.id);
    if (pos) {
      const extraLines = (n.metadata?.attributes?.length ?? 0) + (n.metadata?.methods?.length ?? 0);
      const height = NODE_HEIGHT + Math.min(extraLines * 12, 80);
      layout.set(n.id, {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - height / 2,
        width: NODE_WIDTH,
        height,
      });
    }
  }

  return { ...diagram, layout };
}

/** Compute SVG viewBox that fits all nodes */
export function computeViewBox(diagram: Diagram): { width: number; height: number } {
  if (!diagram.layout || diagram.layout.size === 0) return { width: 600, height: 400 };
  let maxX = 0, maxY = 0;
  for (const [, pos] of diagram.layout) {
    maxX = Math.max(maxX, pos.x + pos.width);
    maxY = Math.max(maxY, pos.y + pos.height);
  }
  return { width: Math.max(maxX + 40, 400), height: Math.max(maxY + 40, 300) };
}
