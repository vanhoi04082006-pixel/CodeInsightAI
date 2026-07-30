// CodeInsight AI — Diagram Engine v2 Types
//
// Unified diagram model — all providers output this format.
// Renderer only reads Diagram, never touches raw data.

export type DiagramType =
  | "uml"
  | "sequence"
  | "erd"
  | "architecture"
  | "module"
  | "component";

export interface DiagramNode {
  id: string;
  type: string;          // "class" | "interface" | "actor" | "entity" | "layer" | "module" | "component" | "lifeline"
  label: string;
  sublabel?: string;     // file path, namespace, etc.
  metadata?: {
    visibility?: "public" | "private" | "protected";
    isStatic?: boolean;
    isAbstract?: boolean;
    attributes?: string[];     // class attributes
    methods?: string[];        // method signatures
    primaryKey?: boolean;      // ERD
    foreignKey?: boolean;      // ERD
    nullable?: boolean;        // ERD
    unique?: boolean;          // ERD
    layer?: string;            // architecture: "frontend" | "api" | "service" | "db"
    [key: string]: any;
  };
}

export interface DiagramEdge {
  source: string;
  target: string;
  type: string;          // "extends" | "implements" | "composition" | "aggregation" | "dependency" | "association" | "call" | "message" | "relation" | "import" | "renders"
  label?: string;        // method name, route path, relation cardinality
  metadata?: {
    direction?: "forward" | "backward" | "bidirectional";
    dashed?: boolean;    // dashed = dependency, solid = strong
    [key: string]: any;
  };
}

export interface Diagram {
  id: string;
  type: DiagramType;
  title: string;
  description: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  // Pre-laid-out positions (filled by LayoutEngine)
  layout?: Map<string, { x: number; y: number; width: number; height: number }>;
  // Optional metadata (viewBox, stats, etc.)
  metadata?: Record<string, any>;
}

export interface DiagramProvider {
  type: DiagramType;
  label: string;
  icon: string;          // emoji
  description: string;
  /** Generate a Diagram from GraphData + AnalysisReport */
  generate(graphData: any, report: any): Diagram;
}

export interface DiagramStats {
  nodeCount: number;
  edgeCount: number;
  diagramType: DiagramType;
}

export const ALL_DIAGRAM_TYPES: Array<{
  type: DiagramType;
  label: string;
  icon: string;
  description: string;
}> = [
  { type: "uml", label: "UML", icon: "🏛", description: "Class diagram with attributes, methods, inheritance" },
  { type: "sequence", label: "Sequence", icon: "📐", description: "Request flow: Route → Controller → Service → DB" },
  { type: "erd", label: "ERD", icon: "🗄", description: "Database entities with relationships" },
  { type: "architecture", label: "Architecture", icon: "🏗", description: "High-level layers: Frontend → API → Service → DB" },
  { type: "module", label: "Module", icon: "📦", description: "Module/package dependency graph" },
  { type: "component", label: "Component", icon: "🧩", description: "React/Vue component hierarchy" },
];
