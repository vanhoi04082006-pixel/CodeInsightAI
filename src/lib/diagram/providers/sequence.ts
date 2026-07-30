// Sequence Diagram Provider — request flow from routes + call graph

import type { Diagram, DiagramProvider, DiagramNode, DiagramEdge } from "../types";

export const sequenceProvider: DiagramProvider = {
  type: "sequence",
  label: "Sequence Diagram",
  icon: "📐",
  description: "API request flow: Client → Route → Service → Database",

  generate(graphData: any, report: any): Diagram {
    const nodes: DiagramNode[] = [];
    const edges: DiagramEdge[] = [];

    // Extract routes from parsed files
    const routes = (report?.files || []).flatMap((f: any) =>
      (f.routes || []).map((r: string) => ({ path: r, file: f.path, functions: f.functions || [] }))
    );

    if (routes.length === 0) {
      return {
        id: "seq-empty", type: "sequence",
        title: "Sequence Diagram", description: "No API routes detected.",
        nodes: [], edges: [],
      };
    }

    // Create lifeline actors: Client, API, Service, DB
    const actors = [
      { id: "client", label: "Client", type: "actor" },
      { id: "api", label: "API", type: "actor" },
      { id: "service", label: "Service", type: "actor" },
      { id: "db", label: "Database", type: "actor" },
    ];
    actors.forEach(a => nodes.push(a));

    // Top 6 routes
    const topRoutes = routes.slice(0, 6);
    for (const r of topRoutes) {
      // Client → API
      edges.push({
        source: "client", target: "api", type: "message",
        label: r.path,
      });
      // API → Service (if file has functions)
      if (r.functions.length > 0) {
        edges.push({
          source: "api", target: "service", type: "call",
          label: r.functions[0] + "()",
        });
        // Service → DB (heuristic: if function name contains query/find/save/get)
        if (r.functions.some((fn: string) => /query|find|save|get|create|update|delete|fetch/i.test(fn))) {
          edges.push({
            source: "service", target: "db", type: "call",
            label: "query()",
          });
        }
      }
      // Response (dashed back)
      edges.push({
        source: "api", target: "client", type: "message",
        label: "200 OK",
        metadata: { dashed: true },
      });
    }

    return {
      id: "seq-diagram", type: "sequence",
      title: "Sequence Diagram",
      description: `Request flow for ${topRoutes.length} API routes: Client → API → Service → Database.`,
      nodes, edges,
    };
  },
};
