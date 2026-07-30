// CodeInsight AI — Diagram Engine v2 (Enterprise)
//
// Thin facade with plugin architecture:
// - registerProvider(type, provider)
// - registerLayout(type, fn)
// - registerExporter(format, fn)
//
// AI Agent ready:
//   DiagramEngine.generate("uml", graphData, report)
//   DiagramEngine.query(diagram).findPath("A", "B")
//   DiagramEngine.export(diagram, "mermaid")

import type { Diagram, DiagramProvider, DiagramType } from "./types";
import { layoutDiagram, type LayoutType, registerLayout, getLayoutFn, LAYOUT_OPTIONS } from "./diagram-layout";
import { getProvider, registerProvider } from "./providers";
import { DiagramQuery } from "./diagram-query";
import { getCachedDiagram, setCachedDiagram, clearCache } from "./diagram-cache";
import { exportDiagram, registerExporter, type ExportFormat } from "./diagram-export";

export class DiagramEngine {
  // ─── Generation ───

  static generate(type: DiagramType, graphData: any, report: any, layout: LayoutType = "dagre-tb", analysisId?: string): Diagram {
    // Check cache
    if (analysisId) {
      const cached = getCachedDiagram(analysisId, type, layout);
      if (cached) return cached;
    }

    const provider = getProvider(type);
    if (!provider) {
      return { id: `empty-${type}`, type, title: "Unknown", description: "Not supported", nodes: [], edges: [] };
    }

    const diagram = provider.generate(graphData, report);
    const layouted = layoutDiagram(diagram, layout);

    // Cache result
    if (analysisId) setCachedDiagram(analysisId, type, layout, layouted);

    return layouted;
  }

  // ─── Query ───

  static query(diagram: Diagram): DiagramQuery {
    return new DiagramQuery(diagram);
  }

  // ─── Export ───

  static export(diagram: Diagram, format: ExportFormat) {
    return exportDiagram(diagram, format);
  }

  // ─── Stats ───

  static getStats(diagram: Diagram) {
    return new DiagramQuery(diagram).getStats();
  }

  // ─── Cache ───

  static clearCache(analysisId?: string) { clearCache(analysisId); }

  // ─── Plugin API ───

  static registerProvider(type: DiagramType, provider: DiagramProvider) { registerProvider(type, provider); }
  static registerLayout(type: LayoutType, fn: any) { registerLayout(type, fn); }
  static registerExporter(format: ExportFormat, fn: any) { registerExporter(format, fn); }

  // ─── Metadata ───

  static getLayoutOptions() { return LAYOUT_OPTIONS; }
  static getExportFormats() { return ["svg", "mermaid", "plantuml"] as ExportFormat[]; }
}
