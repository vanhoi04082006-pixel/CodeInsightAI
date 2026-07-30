// CodeInsight AI — Diagram Engine
// Thin facade — delegates to providers + layout engine.
// AI Agent ready: diagramEngine.generate("uml", graphData, report)

import type { Diagram, DiagramProvider, DiagramType } from "./types";
import { layoutDiagram } from "./diagram-layout";
import { getProvider } from "./providers";

export class DiagramEngine {
  /** Generate a diagram from GraphData + AnalysisReport */
  static generate(type: DiagramType, graphData: any, report: any): Diagram {
    const provider = getProvider(type);
    if (!provider) {
      return {
        id: `empty-${type}`,
        type,
        title: "Unknown",
        description: "Diagram type not supported",
        nodes: [],
        edges: [],
      };
    }
    const diagram = provider.generate(graphData, report);
    // Apply layout
    const layouted = layoutDiagram(diagram, type === "sequence" ? "TB" : "LR");
    return layouted;
  }

  /** List all available diagram types */
  static listTypes() {
    return getProvider(null) ? [] : []; // placeholder — use ALL_DIAGRAM_TYPES from types
  }
}
