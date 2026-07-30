// Component Diagram Provider — React/Vue component hierarchy

import type { Diagram, DiagramProvider, DiagramNode, DiagramEdge } from "../types";

export const componentProvider: DiagramProvider = {
  type: "component",
  label: "Component Diagram",
  icon: "🧩",
  description: "React/Vue/Angular component hierarchy",

  generate(graphData: any, report: any): Diagram {
    const nodes: DiagramNode[] = [];
    const edges: DiagramEdge[] = [];

    const files = report?.files || [];
    const componentFiles = files.filter((f: any) => f.components?.length > 0).slice(0, 12);

    if (componentFiles.length === 0) {
      return {
        id: "comp-empty", type: "component",
        title: "Component Diagram", description: "No UI components detected.",
        nodes: [], edges: [],
      };
    }

    // Create nodes for each file with components
    for (const f of componentFiles) {
      const name = f.path.split("/").pop()?.replace(/\.\w+$/, "") || f.path;
      nodes.push({
        id: f.path,
        type: "component",
        label: f.components[0] || name,
        sublabel: f.path,
      });
    }

    // Build edges from imports (file A imports file B → A renders B)
    const nodePaths = new Set(componentFiles.map((f: any) => f.path));
    for (const f of componentFiles) {
      for (const imp of (f.imports || [])) {
        // Resolve import to a file path
        const target = componentFiles.find((tf: any) =>
          tf.path === imp || tf.path.endsWith(imp.split("/").pop() || "__none__")
        );
        if (target && target.path !== f.path) {
          edges.push({
            source: f.path, target: target.path, type: "renders",
            label: "imports",
          });
        }
      }
    }

    return {
      id: "comp-diagram", type: "component",
      title: "Component Diagram",
      description: `${nodes.length} UI components with ${edges.length} import relationships.`,
      nodes, edges: edges.slice(0, 20),
    };
  },
};
