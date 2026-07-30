// UML Diagram Provider — class diagram from GraphData (CodeGraphSnapshot)

import type { Diagram, DiagramProvider, DiagramNode, DiagramEdge } from "../types";

export const umlProvider: DiagramProvider = {
  type: "uml",
  label: "UML Class Diagram",
  icon: "🏛",
  description: "Class diagram with attributes, methods, and inheritance",

  generate(graphData: any, report: any): Diagram {
    const nodes: DiagramNode[] = [];
    const edges: DiagramEdge[] = [];

    // Extract class/interface nodes from GraphData
    const classNodes = (graphData?.nodes || []).filter((n: any) => n.type === "class" || n.type === "file");

    // Use report.files for richer data (ParsedFile has classes, functions, interfaces)
    const files = report?.files || [];
    const filesWithClasses = files.filter((f: any) => f.classes?.length > 0 || f.interfaces?.length > 0).slice(0, 12);

    for (const f of filesWithClasses) {
      const name = f.path.split("/").pop()?.replace(/\.\w+$/, "") || f.path;
      const isInterface = f.interfaces?.length > 0 && f.classes?.length === 0;

      nodes.push({
        id: f.path,
        type: isInterface ? "interface" : "class",
        label: name,
        sublabel: f.path,
        metadata: {
          isAbstract: f.classes?.some((c: string) => c.startsWith("Abstract")),
          attributes: f.classes?.slice(0, 4).map((c: string) => `+ ${c}`) || [],
          methods: f.functions?.slice(0, 4).map((fn: string) => `+ ${fn}()`) || [],
        },
      });
    }

    // Extract inheritance + implements edges from GraphData
    for (const e of graphData?.edges || []) {
      if (e.type === "extends") {
        edges.push({
          source: e.from, target: e.to, type: "extends",
          label: "extends",
          metadata: { dashed: false },
        });
      } else if (e.type === "implements") {
        edges.push({
          source: e.from, target: e.to, type: "implements",
          label: "implements",
          metadata: { dashed: true },
        });
      } else if (e.type === "depends_on" && edges.length < 20) {
        // Only show dependency if both endpoints are in our node set
        if (filesWithClasses.some((f: any) => f.path === e.from) && filesWithClasses.some((f: any) => f.path === e.to)) {
          edges.push({
            source: e.from, target: e.to, type: "dependency",
            metadata: { dashed: true },
          });
        }
      }
    }

    return {
      id: "uml-diagram",
      type: "uml",
      title: "UML Class Diagram",
      description: `Showing ${nodes.length} classes/interfaces with inheritance, methods, and dependencies.`,
      nodes, edges,
    };
  },
};
