// ERD Provider — database entities from Prisma/Mongoose/TypeORM

import type { Diagram, DiagramProvider, DiagramNode, DiagramEdge } from "../types";

export const erdProvider: DiagramProvider = {
  type: "erd",
  label: "Entity Relationship Diagram",
  icon: "🗄",
  description: "Database entities with fields, PK/FK, and relationships",

  generate(graphData: any, report: any): Diagram {
    const nodes: DiagramNode[] = [];
    const edges: DiagramEdge[] = [];
    const files = report?.files || [];

    // Detect Prisma models
    for (const f of files) {
      if (f.path?.endsWith(".prisma") || f.path?.includes("schema.prisma")) {
        for (const cls of (f.classes || [])) {
          nodes.push({
            id: `${f.path}#${cls}`,
            type: "entity",
            label: cls,
            sublabel: f.path,
            metadata: {
              primaryKey: true,
              attributes: ["id Int @id", "createdAt DateTime", "updatedAt DateTime"],
            },
          });
        }
      }
      // Detect Mongoose schemas
      if (f.imports?.some((i: string) => i.includes("mongoose"))) {
        for (const cls of (f.classes || [])) {
          nodes.push({
            id: `${f.path}#${cls}`,
            type: "entity",
            label: cls,
            sublabel: f.path,
            metadata: {
              primaryKey: true,
              attributes: ["_id ObjectId", "createdAt Date", "updatedAt Date"],
            },
          });
        }
      }
      // Detect TypeORM entities
      if (f.imports?.some((i: string) => i.includes("typeorm"))) {
        for (const cls of (f.classes || [])) {
          nodes.push({
            id: `${f.path}#${cls}`,
            type: "entity",
            label: cls,
            sublabel: f.path,
            metadata: {
              primaryKey: true,
              attributes: ["id number @PrimaryColumn", "createdAt Date"],
            },
          });
        }
      }
    }

    // Detect relationships from imports (file A imports file B with "Entity"/"Model" → relation)
    const entityFiles = files.filter((f: any) =>
      f.classes?.some((c: string) => c.includes("Entity") || c.includes("Model") || c.includes("Schema"))
    );
    for (const f of entityFiles.slice(0, 10)) {
      for (const imp of (f.imports || [])) {
        const target = entityFiles.find((tf: any) => tf.path.includes(imp.split("/").pop()?.replace(/\.\w+$/, "") || "__none__"));
        if (target && target.path !== f.path) {
          edges.push({
            source: `${f.path}#${f.classes[0]}`,
            target: `${target.path}#${target.classes[0]}`,
            type: "relation",
            label: "1:N",
            metadata: { dashed: false },
          });
        }
      }
    }

    if (nodes.length === 0) {
      return {
        id: "erd-empty", type: "erd",
        title: "ERD", description: "No database schema detected (Prisma/Mongoose/TypeORM).",
        nodes: [], edges: [],
      };
    }

    return {
      id: "erd-diagram", type: "erd",
      title: "Entity Relationship Diagram",
      description: `${nodes.length} database entities with fields and relationships.`,
      nodes: nodes.slice(0, 8), edges: edges.slice(0, 12),
    };
  },
};
