// CodeInsight AI — CodeGraph Builder
//
// Builds a semantic knowledge graph from a parsed repository.
// The graph contains nodes (files, functions, classes, modules) and edges
// (imports, calls, extends, implements, uses, depends_on).
//
// This graph is the "Google Maps for codebase" — AI agents query it instead
// of grep/read files, saving massive token costs and enabling instant navigation.

import type { ParsedRepository, ParsedFile } from "@/lib/repo-parser";

export interface CodeGraphNode {
  id: string;
  type: "file" | "function" | "class" | "module" | "route" | "component" | "import";
  label: string;
  filePath: string;
  language: string;
  startLine?: number;
  endLine?: number;
  metadata: {
    complexity?: number;
    linesOfCode?: number;
    description?: string;
    isExported?: boolean;
    isAsync?: boolean;
    params?: string[];
    returnType?: string;
    group?: number;
  };
}

export interface CodeGraphEdge {
  from: string;
  to: string;
  type: "imports" | "calls" | "extends" | "implements" | "uses" | "depends_on" | "exports";
  weight: number;
  metadata?: { line?: number; context?: string };
}

export interface CodeGraph {
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
  nodeCount: number;
  edgeCount: number;
  builtAt: string;
}

export function buildCodeGraph(parsed: ParsedRepository): CodeGraph {
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  const nodeMap = new Map<string, CodeGraphNode>();

  // 1. File nodes
  for (const file of parsed.files) {
    const fileNode: CodeGraphNode = {
      id: file.path, type: "file", label: file.path.split("/").pop() || file.path,
      filePath: file.path, language: file.language,
      metadata: { linesOfCode: file.lines, complexity: file.complexity, description: file.description, group: getLangGroup(file.language) },
    };
    nodes.push(fileNode); nodeMap.set(file.path, fileNode);
  }

  // 2. Import edges
  for (const file of parsed.files) {
    for (const imp of file.imports) {
      const resolved = resolveImport(imp, parsed.files, file.path);
      if (resolved && nodeMap.has(resolved)) {
        edges.push({ from: file.path, to: resolved, type: "imports", weight: 1 });
      }
    }
  }

  // 3. Function + Class + Route + Component nodes
  for (const file of parsed.files) {
    for (const fn of file.functions) {
      const id = `${file.path}#${fn}`;
      if (!nodeMap.has(id)) {
        nodes.push({ id, type: "function", label: fn, filePath: file.path, language: file.language, metadata: { isExported: true, group: getLangGroup(file.language) } });
        nodeMap.set(id, nodes[nodes.length - 1]);
        edges.push({ from: file.path, to: id, type: "exports", weight: 1 });
      }
    }
    for (const cls of file.classes) {
      const id = `${file.path}#${cls}`;
      if (!nodeMap.has(id)) {
        nodes.push({ id, type: "class", label: cls, filePath: file.path, language: file.language, metadata: { isExported: true, group: getLangGroup(file.language) } });
        nodeMap.set(id, nodes[nodes.length - 1]);
        edges.push({ from: file.path, to: id, type: "exports", weight: 1 });
      }
    }
    for (const route of file.routes) {
      const id = `${file.path}#route:${route}`;
      if (!nodeMap.has(id)) {
        nodes.push({ id, type: "route", label: route, filePath: file.path, language: file.language, metadata: { group: 3 } });
        nodeMap.set(id, nodes[nodes.length - 1]);
        edges.push({ from: file.path, to: id, type: "exports", weight: 1 });
      }
    }
    for (const comp of file.components) {
      const id = `${file.path}#comp:${comp}`;
      if (!nodeMap.has(id)) {
        nodes.push({ id, type: "component", label: comp, filePath: file.path, language: file.language, metadata: { group: 4 } });
        nodeMap.set(id, nodes[nodes.length - 1]);
        edges.push({ from: file.path, to: id, type: "exports", weight: 1 });
      }
    }
  }

  // 4. Directory module nodes
  const dirMap = new Map<string, CodeGraphNode>();
  for (const file of parsed.files) {
    const dir = file.path.split("/").slice(0, -1).join("/") || "/";
    if (!dirMap.has(dir)) {
      const dirNode: CodeGraphNode = { id: `dir:${dir}`, type: "module", label: dir.split("/").pop() || dir, filePath: dir, language: "directory", metadata: { group: 5 } };
      nodes.push(dirNode); dirMap.set(dir, dirNode);
    }
    edges.push({ from: `dir:${dir}`, to: file.path, type: "depends_on", weight: 0.3 });
  }

  return { nodes, edges, nodeCount: nodes.length, edgeCount: edges.length, builtAt: new Date().toISOString() };
}

function resolveImport(imp: string, files: ParsedFile[], fromPath: string): string | null {
  if (!imp.startsWith(".") && !imp.startsWith("/")) return null;
  const fromDir = fromPath.split("/").slice(0, -1).join("/");
  let resolved = imp;
  if (imp.startsWith("./")) resolved = `${fromDir}/${imp.slice(2)}`;
  else if (imp.startsWith("../")) { const p = fromDir.split("/"); p.pop(); resolved = `${p.join("/")}/${imp.slice(3)}`; }
  else if (imp.startsWith("/")) resolved = imp.slice(1);
  if (files.some((f) => f.path === resolved)) return resolved;
  const exts = [".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte", ".py", ".go", ".rs", ".java"];
  for (const ext of exts) { const w = `${resolved}${ext}`; if (files.some((f) => f.path === w)) return w; }
  for (const ext of exts) { const i = `${resolved}/index${ext}`; if (files.some((f) => f.path === i)) return i; }
  return null;
}

function getLangGroup(lang: string): number {
  const g: Record<string, number> = { TypeScript: 0, JavaScript: 0, TSX: 0, JSX: 0, Python: 1, Go: 2, Rust: 2, Java: 2, CSS: 3, HTML: 4, Vue: 5, Svelte: 5, JSON: 6 };
  return g[lang] ?? 0;
}

// ── Query functions ──

export function findCallers(graph: CodeGraph, fnId: string): CodeGraphNode[] {
  const ids = new Set<string>();
  for (const e of graph.edges) { if (e.to === fnId && (e.type === "calls" || e.type === "uses")) ids.add(e.from); }
  return graph.nodes.filter((n) => ids.has(n.id));
}

export function findCallees(graph: CodeGraph, fnId: string): CodeGraphNode[] {
  const ids = new Set<string>();
  for (const e of graph.edges) { if (e.from === fnId && (e.type === "calls" || e.type === "uses")) ids.add(e.to); }
  return graph.nodes.filter((n) => ids.has(n.id));
}

export function impactAnalysis(graph: CodeGraph, nodeId: string): CodeGraphNode[] {
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const cur = queue.shift()!; if (visited.has(cur)) continue; visited.add(cur);
    for (const e of graph.edges) { if (e.to === cur && !visited.has(e.from)) queue.push(e.from); }
  }
  visited.delete(nodeId);
  return graph.nodes.filter((n) => visited.has(n.id));
}

export function shortestPath(graph: CodeGraph, fromId: string, toId: string): CodeGraphNode[] | null {
  if (fromId === toId) return [graph.nodes.find((n) => n.id === fromId)!].filter(Boolean);
  const visited = new Set([fromId]);
  const queue: Array<{ id: string; path: string[] }> = [{ id: fromId, path: [fromId] }];
  while (queue.length > 0) {
    const { id, path } = queue.shift()!;
    for (const e of graph.edges) {
      if (e.from === id && !visited.has(e.to)) {
        const np = [...path, e.to];
        if (e.to === toId) return np.map((id) => graph.nodes.find((n) => n.id === id)).filter(Boolean) as CodeGraphNode[];
        visited.add(e.to); queue.push({ id: e.to, path: np });
      }
    }
  }
  return null;
}

export function searchNodes(graph: CodeGraph, query: string): CodeGraphNode[] {
  const l = query.toLowerCase();
  return graph.nodes.filter((n) => n.label.toLowerCase().includes(l) || n.filePath.toLowerCase().includes(l) || n.id.toLowerCase().includes(l));
}

export function getNeighbors(graph: CodeGraph, nodeId: string): { incoming: CodeGraphNode[]; outgoing: CodeGraphNode[] } {
  const inc = new Set<string>(); const out = new Set<string>();
  for (const e of graph.edges) { if (e.to === nodeId) inc.add(e.from); if (e.from === nodeId) out.add(e.to); }
  return { incoming: graph.nodes.filter((n) => inc.has(n.id)), outgoing: graph.nodes.filter((n) => out.has(n.id)) };
}

export function getGraphStats(graph: CodeGraph): { totalNodes: number; totalEdges: number; byType: Record<string, number>; mostConnected: Array<{ node: CodeGraphNode; degree: number }> } {
  const byType: Record<string, number> = {}; const deg = new Map<string, number>();
  for (const n of graph.nodes) { byType[n.type] = (byType[n.type] || 0) + 1; deg.set(n.id, 0); }
  for (const e of graph.edges) { deg.set(e.from, (deg.get(e.from) || 0) + 1); deg.set(e.to, (deg.get(e.to) || 0) + 1); }
  const mostConnected = Array.from(deg.entries()).map(([id, d]) => ({ node: graph.nodes.find((n) => n.id === id)!, degree: d })).filter((x) => x.node).sort((a, b) => b.degree - a.degree).slice(0, 10);
  return { totalNodes: graph.nodes.length, totalEdges: graph.edges.length, byType, mostConnected };
}
