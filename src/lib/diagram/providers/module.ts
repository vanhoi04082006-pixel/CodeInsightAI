// Module Diagram Provider — module/package dependency graph

import type { Diagram, DiagramProvider, DiagramNode, DiagramEdge } from "../types";

export const moduleProvider: DiagramProvider = {
  type: "module",
  label: "Module Diagram",
  icon: "📦",
  description: "Module/package dependency graph",

  generate(graphData: any, report: any): Diagram {
    const nodes: DiagramNode[] = [];
    const edges: DiagramEdge[] = [];

    // Use dependency graph from report
    const deps = report?.dependencies;
    if (!deps || !Array.isArray(deps.nodes)) {
      return { id: "mod-empty", type: "module", title: "Module", description: "No module data.", nodes: [], edges: [] };
    }

    // Group files by top-level directory → module
    const moduleMap = new Map<string, { files: number; lines: number }>();
    for (const f of (report.files || [])) {
      const parts = f.path.split("/");
      const mod = parts.length > 1 ? parts[0] : "root";
      const existing = moduleMap.get(mod) || { files: 0, lines: 0 };
      existing.files++;
      existing.lines += f.lines || 0;
      moduleMap.set(mod, existing);
    }

    for (const [mod, info] of moduleMap) {
      nodes.push({
        id: `mod-${mod}`,
        type: "module",
        label: mod,
        sublabel: `${info.files} files · ${info.lines.toLocaleString()} lines`,
      });
    }

    // Build edges from dependency edges (aggregate by module)
    const edgeSet = new Set<string>();
    for (const e of (deps.edges || [])) {
      const fromMod = e.from?.split("/")[0] || "root";
      const toMod = e.to?.split("/")[0] || "root";
      if (fromMod !== toMod) {
        const key = `${fromMod}→${toMod}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({
            source: `mod-${fromMod}`,
            target: `mod-${toMod}`,
            type: "import",
          });
        }
      }
    }

    return {
      id: "mod-diagram", type: "module",
      title: "Module Diagram",
      description: `${nodes.length} modules with ${edges.length} dependencies.`,
      nodes: nodes.slice(0, 15), edges: edges.slice(0, 20),
    };
  },
};
