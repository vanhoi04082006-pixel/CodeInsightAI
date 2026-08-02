// CodeInsight AI — Diagram Service (Layer 3)
// Wraps the existing Diagram Engine (src/lib/diagram/) behind the Service interface.
// Accepts SPM, delegates to DiagramEngine for rendering/export.

import type {
  SemanticProjectModel,
  DiagramService as IDiagramService,
  DiagramOptions,
  Result,
  AgentError,
} from "../contracts";
import { DiagramEngine } from "@/lib/diagram/diagram-engine";

export class DiagramServiceImpl implements IDiagramService {
  /**
   * Generate diagram data from SPM.
   * Delegates to the existing DiagramEngine static methods.
   */
  generate(
    type: string,
    spm: SemanticProjectModel,
    options?: DiagramOptions,
  ): Result<unknown> {
    try {
      // Build graph data from SPM for the diagram engine
      const graphData = {
        nodes: spm.files.map((f) => ({
          id: f.path,
          label: f.path.split("/").pop() || f.path,
          type: f.language,
        })),
        edges: spm.edges.map((e) => ({
          source: e.source,
          target: e.target,
          type: e.type,
        })),
      };

      // Convert SPM to a report-like object for the diagram engine
      const reportLike = {
        repoOwner: spm.repoOwner,
        repoName: spm.repoName,
        architecture: spm.architecture,
        files: spm.files.map((f) => ({
          path: f.path,
          language: f.language,
        })),
        dependencies: {
          nodes: graphData.nodes,
          edges: graphData.edges.map((e: any) => ({ from: e.source, to: e.target, weight: 1 })),
          circular: [],
        },
      };

      const layout = (options?.layout as any) || "dagre-tb";

      // Delegate to existing DiagramEngine
      const diagram = DiagramEngine.generate(
        type as any,
        graphData,
        reportLike as any,
        layout,
      );

      return ok(diagram);
    } catch (e) {
      return err(
        "TOOL_EXECUTION_FAILED",
        `Failed to generate diagram: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Export a diagram to SVG/Mermaid/PlantUML. */
  export(diagram: unknown, format: string): Result<string> {
    try {
      const result = DiagramEngine.export(diagram as any, format as any);
      if (result == null) {
        return err("TOOL_EXECUTION_FAILED", `Export returned null for format: ${format}`);
      }
      return ok(typeof result === "string" ? result : String(result));
    } catch (e) {
      return err(
        "TOOL_EXECUTION_FAILED",
        `Failed to export diagram: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

// ─── Helpers ───

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err(code: string, message: string): { ok: false; error: AgentError } {
  return { ok: false, error: { code, message, recoverable: false } };
}
