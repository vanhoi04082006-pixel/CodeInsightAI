// CodeInsight AI — CodeGraph Builder
//
// Builds a semantic knowledge graph from a parsed repository.
// The graph contains nodes (files, functions, classes, modules) and edges
// (imports, calls, extends, implements, uses, depends_on).
//
// This graph is the "Google Maps for codebase" — AI agents query it instead
// of grep/read files, saving massive token costs and enabling instant navigation.

import type { ParsedRepository, ParsedFile, FunctionSignature } from "@/lib/repo-parser";

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
    unresolvedCallCount?: number;
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
  // Phase 2: set to true when edges are capped at MAX_EDGES (50k)
  truncated?: boolean;
}

const MAX_EDGES = 50000;

export function buildCodeGraph(parsed: ParsedRepository): CodeGraph {
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  const nodeMap = new Map<string, CodeGraphNode>();

  // Pre-compute set of file paths + per-file exported symbols for fast lookup
  const filePathSet = new Set(parsed.files.map((f) => f.path));
  const fileExports = new Map<string, Set<string>>();
  for (const f of parsed.files) {
    const exports = new Set<string>();
    f.functions.forEach((fn) => exports.add(fn));
    f.classes.forEach((c) => exports.add(c));
    f.components.forEach((c) => exports.add(c));
    f.interfaces.forEach((i) => exports.add(i));
    fileExports.set(f.path, exports);
  }

  // 1. File nodes
  for (const file of parsed.files) {
    const fileNode: CodeGraphNode = {
      id: file.path, type: "file", label: file.path.split("/").pop() || file.path,
      filePath: file.path, language: file.language,
      metadata: { linesOfCode: file.lines, complexity: file.complexity, description: file.description, group: getLangGroup(file.language), unresolvedCallCount: 0 },
    };
    nodes.push(fileNode); nodeMap.set(file.path, fileNode);
  }

  // 2. Import edges
  for (const file of parsed.files) {
    for (const imp of file.imports) {
      const resolved = resolveImport(imp, filePathSet, file.path);
      if (resolved && nodeMap.has(resolved)) {
        edges.push({ from: file.path, to: resolved, type: "imports", weight: 1 });
      }
    }
  }

  // 3. Function + Class + Route + Component nodes (with metadata from functionSignatures if available)
  for (const file of parsed.files) {
    // Build a lookup of signature by name (Phase 2 — optional)
    const sigByName = new Map<string, FunctionSignature>();
    if (file.functionSignatures) {
      for (const sig of file.functionSignatures) sigByName.set(sig.name, sig);
    }

    for (const fn of file.functions) {
      const id = `${file.path}#${fn}`;
      if (!nodeMap.has(id)) {
        const sig = sigByName.get(fn);
        const fnNode: CodeGraphNode = {
          id, type: "function", label: fn, filePath: file.path, language: file.language,
          metadata: {
            isExported: sig?.isExported ?? true,
            isAsync: sig?.isAsync,
            params: sig?.params,
            returnType: sig?.returnType,
            group: getLangGroup(file.language),
          },
        };
        if (sig) {
          fnNode.startLine = sig.startLine;
          fnNode.endLine = sig.endLine;
        }
        nodes.push(fnNode);
        nodeMap.set(id, fnNode);
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

  // 5. Emit `calls` edges from call sites (Phase 2)
  for (const file of parsed.files) {
    if (!file.callSites) continue; // backward-compatible: skip if no call-site data
    const symbolMap = buildSymbolMap(file, parsed.files, filePathSet, fileExports);
    const fnRanges = buildFunctionRanges(file);
    const fileNode = nodeMap.get(file.path);
    const seenCalls = new Set<string>();

    for (const call of file.callSites) {
      const calleeId = symbolMap.get(call.name);
      if (!calleeId || !nodeMap.has(calleeId)) {
        // Unresolved — bump counter on file node so AI passes can mention it
        if (fileNode) {
          fileNode.metadata.unresolvedCallCount = (fileNode.metadata.unresolvedCallCount || 0) + 1;
        }
        continue;
      }

      // Caller resolution: find the function whose [startLine, endLine] contains this call site
      let callerId = file.path; // default: file-level node
      for (const fn of fnRanges) {
        if (call.line >= fn.startLine && call.line <= fn.endLine) {
          callerId = fn.nodeId;
          break;
        }
      }

      // Dedupe (caller, callee, line) tuples — keep one edge per call site line
      const key = `${callerId}|${calleeId}|${call.line}`;
      if (seenCalls.has(key)) continue;
      seenCalls.add(key);

      edges.push({
        from: callerId,
        to: calleeId,
        type: "calls",
        weight: 1,
        metadata: { line: call.line, context: call.context },
      });
    }
  }

  // 6. Emit `extends` / `implements` edges from inheritance (Phase 2)
  for (const file of parsed.files) {
    if (!file.inheritance) continue;
    const symbolMap = buildSymbolMap(file, parsed.files, filePathSet, fileExports);

    for (const inh of file.inheritance) {
      const childId = `${file.path}#${inh.className}`;
      if (!nodeMap.has(childId)) continue; // class not in graph — skip

      if (inh.extends) {
        const parentId = symbolMap.get(inh.extends);
        if (parentId && nodeMap.has(parentId) && parentId !== childId) {
          edges.push({ from: childId, to: parentId, type: "extends", weight: 1 });
        }
      }

      for (const impl of inh.implements) {
        const parentId = symbolMap.get(impl);
        if (parentId && nodeMap.has(parentId) && parentId !== childId) {
          edges.push({ from: childId, to: parentId, type: "implements", weight: 1 });
        }
      }
    }
  }

  // 7. Emit `uses` edges from usage sites (Phase 2)
  for (const file of parsed.files) {
    if (!file.usageSites) continue;
    const symbolMap = buildSymbolMap(file, parsed.files, filePathSet, fileExports);
    const fnRanges = buildFunctionRanges(file);
    const seenUses = new Set<string>();

    for (const use of file.usageSites) {
      const targetId = symbolMap.get(use.symbol);
      if (!targetId || !nodeMap.has(targetId)) continue;

      // Resolve caller (enclosing function) — same logic as calls
      let callerId = file.path;
      for (const fn of fnRanges) {
        if (use.line >= fn.startLine && use.line <= fn.endLine) {
          callerId = fn.nodeId;
          break;
        }
      }

      const key = `${callerId}|${targetId}|${use.line}|${use.kind}`;
      if (seenUses.has(key)) continue;
      seenUses.add(key);

      edges.push({
        from: callerId,
        to: targetId,
        type: "uses",
        weight: 0.5,
        metadata: { line: use.line, context: use.kind },
      });
    }
  }

  // Cap edges at MAX_EDGES (50k) — sort by weight desc, keep top N
  let truncated = false;
  if (edges.length > MAX_EDGES) {
    edges.sort((a, b) => b.weight - a.weight);
    edges.length = MAX_EDGES;
    truncated = true;
  }

  return {
    nodes, edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    builtAt: new Date().toISOString(),
    truncated,
  };
}

// ── Helpers ──

// Build a symbol-name → node-id map for a file. Combines:
//   (a) local symbols (functions, classes, components)
//   (b) imported symbols (resolved through import path → file → exports)
// Local symbols take precedence over imported ones.
function buildSymbolMap(
  file: ParsedFile,
  allFiles: ParsedFile[],
  filePathSet: Set<string>,
  fileExports: Map<string, Set<string>>,
): Map<string, string> {
  const map = new Map<string, string>();

  // (a) Local symbols
  for (const fn of file.functions) map.set(fn, `${file.path}#${fn}`);
  for (const cls of file.classes) map.set(cls, `${file.path}#${cls}`);
  for (const comp of file.components) map.set(comp, `${file.path}#comp:${comp}`);

  // (b) Imported symbols — for each import path, resolve to a file, then add all its exports
  for (const imp of file.imports) {
    const resolvedPath = resolveImport(imp, filePathSet, file.path);
    if (!resolvedPath) continue;
    const exports = fileExports.get(resolvedPath);
    if (!exports) continue;
    for (const sym of exports) {
      // Don't overwrite local symbols
      if (!map.has(sym)) {
        // Component exports get the `#comp:` prefix
        const resolvedFile = allFiles.find((f) => f.path === resolvedPath);
        const isComponent = resolvedFile?.components.includes(sym);
        map.set(sym, isComponent ? `${resolvedPath}#comp:${sym}` : `${resolvedPath}#${sym}`);
      }
    }
  }

  return map;
}

// Build a list of function line ranges for caller resolution.
// Falls back to empty list if functionSignatures isn't populated (legacy files).
function buildFunctionRanges(file: ParsedFile): Array<{ startLine: number; endLine: number; nodeId: string }> {
  if (!file.functionSignatures) return [];
  return file.functionSignatures.map((sig) => ({
    startLine: sig.startLine,
    endLine: sig.endLine,
    nodeId: `${file.path}#${sig.name}`,
  }));
}

function resolveImport(imp: string, filePathSet: Set<string>, fromPath: string): string | null {
  // Build candidate base paths (without extension)
  const candidates: string[] = [];

  if (imp.startsWith("@/")) {
    const rest = imp.slice(2);
    candidates.push("src/" + rest, rest); // Next.js convention: @/ → src/, with root fallback
  } else if (imp.startsWith("~/")) {
    const rest = imp.slice(2);
    candidates.push("src/" + rest, rest);
  } else if (imp.startsWith("@components/")) {
    const rest = imp.slice("@components/".length);
    candidates.push("src/components/" + rest, "components/" + rest);
  } else if (imp.startsWith("./")) {
    const fromDir = fromPath.split("/").slice(0, -1).join("/");
    candidates.push(`${fromDir}/${imp.slice(2)}`);
  } else if (imp.startsWith("../")) {
    const p = fromPath.split("/").slice(0, -1); p.pop();
    candidates.push(`${p.join("/")}/${imp.slice(3)}`);
  } else if (imp.startsWith("/")) {
    candidates.push(imp.slice(1));
  } else {
    return null; // bare module imports (node_modules) — skip
  }

  const exts = ["", ".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte", ".py", ".go", ".rs", ".java"];
  for (const cand of candidates) {
    for (const ext of exts) {
      const try1 = cand + ext;
      if (filePathSet.has(try1)) return try1;
    }
    for (const ext of exts) {
      const try2 = `${cand}/index${ext}`;
      if (filePathSet.has(try2)) return try2;
    }
  }
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
