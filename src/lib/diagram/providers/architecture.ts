// Architecture Diagram Provider — high-level layers

import type { Diagram, DiagramProvider, DiagramNode, DiagramEdge } from "../types";

export const architectureProvider: DiagramProvider = {
  type: "architecture",
  label: "Architecture Diagram",
  icon: "🏗",
  description: "High-level layers: Frontend → API → Service → Database",

  generate(graphData: any, report: any): Diagram {
    const arch = report?.architecture;
    if (!arch) {
      return { id: "arch-empty", type: "architecture", title: "Architecture", description: "No architecture data.", nodes: [], edges: [] };
    }

    // Build layer nodes from architecture.layers
    const nodes: DiagramNode[] = (arch.layers || []).slice(0, 6).map((l: any) => ({
      id: `layer-${l.name}`,
      type: "layer",
      label: l.name,
      sublabel: `${l.files} files`,
      metadata: { layer: l.name.toLowerCase() },
    }));

    // If no layers detected, create generic flow
    if (nodes.length === 0) {
      nodes.push(
        { id: "frontend", type: "layer", label: "Frontend", metadata: { layer: "frontend" } },
        { id: "api", type: "layer", label: "API", metadata: { layer: "api" } },
        { id: "service", type: "layer", label: "Service", metadata: { layer: "service" } },
        { id: "db", type: "layer", label: "Database", metadata: { layer: "db" } },
      );
    }

    // Linear flow edges
    const edges: DiagramEdge[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        source: nodes[i].id, target: nodes[i + 1].id, type: "dependency",
        label: "depends on",
      });
    }

    return {
      id: "arch-diagram", type: "architecture",
      title: "Architecture Diagram",
      description: `Pattern: ${arch.pattern}. ${nodes.length} layers: ${nodes.map(n => n.label).join(" → ")}.`,
      nodes, edges,
    };
  },
};
