// CodeInsight AI — Graph Provider registry + factory
//
// Single import surface for the unified Graph Engine. Consumers (API
// routes, UI hooks) do:
//
//   import { getProvider, ALL_GRAPH_TYPES } from "@/lib/graph/providers";
//   const provider = getProvider("call-graph");
//   const data = await provider.load(analysisId, report);
//   const service = new GraphService(data);
//   const inspector = service.getInspector(nodeId);

import type { GraphProvider, GraphType } from "../types";
import { dependencyProvider } from "./dependency";
import { callGraphProvider } from "./call-graph";
import { classHierarchyProvider } from "./class-hierarchy";
import { moduleImportsProvider } from "./module-imports";
import { apiFlowProvider } from "./api-flow";
import { databaseFlowProvider } from "./database-flow";

/* ───────────────────────── Registry ───────────────────────── */

const PROVIDERS: Record<GraphType, GraphProvider> = {
  dependencies: dependencyProvider,
  "call-graph": callGraphProvider,
  "class-hierarchy": classHierarchyProvider,
  "module-imports": moduleImportsProvider,
  "api-flow": apiFlowProvider,
  "database-flow": databaseFlowProvider,
};

/* ───────────────────────── Factory ───────────────────────── */

/** Returns null for an unknown graph type (rather than throwing) so API
 *  routes can return a clean 400 instead of 500. */
export function getProvider(type: string): GraphProvider | null {
  return PROVIDERS[type as GraphType] ?? null;
}

/* ───────────────────────── Catalog (for UI tabs / dropdowns) ───────────────────────── */

export interface GraphTypeMeta {
  type: GraphType;
  label: string;
  /** Short description shown in the tab tooltip / sidebar. */
  description: string;
  /** Lucide icon name or emoji. */
  icon: string;
}

export const ALL_GRAPH_TYPES: GraphTypeMeta[] = [
  {
    type: "dependencies",
    label: "Dependencies",
    description: "Module-level dependency graph from static analysis.",
    icon: "📦",
  },
  {
    type: "call-graph",
    label: "Call Graph",
    description: "Who-calls-whom at the function level.",
    icon: "📞",
  },
  {
    type: "class-hierarchy",
    label: "Class Hierarchy",
    description: "Inheritance (extends/implements) relationships.",
    icon: "🧬",
  },
  {
    type: "module-imports",
    label: "Module Imports",
    description: "File + directory import graph.",
    icon: "📦",
  },
  {
    type: "api-flow",
    label: "API Flow",
    description: "Request flow centered on route handlers.",
    icon: "🌐",
  },
  {
    type: "database-flow",
    label: "Database Flow",
    description: "DB access paths (query/db/sql/model/schema).",
    icon: "🗄️",
  },
];
