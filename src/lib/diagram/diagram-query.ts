// CodeInsight AI — Diagram Index + Query Engine
// O(1) lookup maps + semantic query API for AI Agents.

import type { Diagram, DiagramNode, DiagramEdge } from "./types";

export class DiagramIndex {
  private readonly byId: Map<string, DiagramNode>;
  private readonly byLabel: Map<string, DiagramNode[]>;
  private readonly byType: Map<string, DiagramNode[]>;
  private readonly outEdges: Map<string, DiagramEdge[]>;
  private readonly inEdges: Map<string, DiagramEdge[]>;

  constructor(diagram: Diagram) {
    this.byId = new Map();
    this.byLabel = new Map();
    this.byType = new Map();
    this.outEdges = new Map();
    this.inEdges = new Map();

    for (const n of diagram.nodes) {
      this.byId.set(n.id, n);
      const labelKey = n.label.toLowerCase();
      const arr = this.byLabel.get(labelKey) ?? [];
      arr.push(n);
      this.byLabel.set(labelKey, arr);
      const typeArr = this.byType.get(n.type) ?? [];
      typeArr.push(n);
      this.byType.set(n.type, typeArr);
    }
    for (const e of diagram.edges) {
      const out = this.outEdges.get(e.source) ?? [];
      out.push(e);
      this.outEdges.set(e.source, out);
      const inc = this.inEdges.get(e.target) ?? [];
      inc.push(e);
      this.inEdges.set(e.target, inc);
    }
  }

  findById(id: string): DiagramNode | undefined { return this.byId.get(id); }
  findByLabel(label: string): DiagramNode[] { return this.byLabel.get(label.toLowerCase()) ?? []; }
  findByType(type: string): DiagramNode[] { return this.byType.get(type) ?? []; }
  getOutgoing(id: string): DiagramEdge[] { return this.outEdges.get(id) ?? []; }
  getIncoming(id: string): DiagramEdge[] { return this.inEdges.get(id) ?? []; }
}

export class DiagramQuery {
  private readonly diagram: Diagram;
  private readonly index: DiagramIndex;

  constructor(diagram: Diagram) {
    this.diagram = diagram;
    this.index = new DiagramIndex(diagram);
  }

  get idx(): DiagramIndex { return this.index; }

  findNode(id: string): DiagramNode | undefined { return this.index.findById(id); }
  findNodeByLabel(label: string): DiagramNode[] { return this.index.findByLabel(label); }

  findChildren(id: string): DiagramNode[] {
    return this.index.getOutgoing(id).map(e => this.index.findById(e.target)).filter(Boolean) as DiagramNode[];
  }
  findParents(id: string): DiagramNode[] {
    return this.index.getIncoming(id).map(e => this.index.findById(e.source)).filter(Boolean) as DiagramNode[];
  }
  findNeighbors(id: string): { incoming: DiagramNode[]; outgoing: DiagramNode[] } {
    return { incoming: this.findParents(id), outgoing: this.findChildren(id) };
  }
  findRelations(id: string): DiagramEdge[] {
    return [...this.index.getIncoming(id), ...this.index.getOutgoing(id)];
  }

  findPath(fromId: string, toId: string): DiagramNode[] | null {
    if (!this.index.findById(fromId) || !this.index.findById(toId)) return null;
    if (fromId === toId) return [this.index.findById(fromId)!];
    const visited = new Set<string>([fromId]);
    const queue: Array<{ id: string; path: string[] }> = [{ id: fromId, path: [fromId] }];
    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      for (const e of this.index.getOutgoing(id)) {
        if (visited.has(e.target)) continue;
        const nextPath = [...path, e.target];
        if (e.target === toId) return nextPath.map(id => this.index.findById(id)).filter(Boolean) as DiagramNode[];
        visited.add(e.target);
        queue.push({ id: e.target, path: nextPath });
      }
    }
    return null;
  }

  findCycles(): string[][] {
    const WHITE = 0, GREY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const n of this.diagram.nodes) color.set(n.id, WHITE);
    const stack: string[] = [];
    const cycles: string[][] = [];
    const seen = new Set<string>();
    const dfs = (u: string) => {
      color.set(u, GREY); stack.push(u);
      for (const e of this.index.getOutgoing(u)) {
        if (!color.has(e.target)) continue;
        if (color.get(e.target) === GREY) {
          const idx = stack.indexOf(e.target);
          if (idx >= 0) {
            const cycle = stack.slice(idx);
            const key = [...cycle].sort().join("|");
            if (!seen.has(key)) { seen.add(key); cycles.push(cycle); }
          }
        } else if (color.get(e.target) === WHITE) dfs(e.target);
      }
      stack.pop(); color.set(u, BLACK);
    };
    for (const n of this.diagram.nodes) if (color.get(n.id) === WHITE) dfs(n.id);
    return cycles;
  }

  findImpact(nodeId: string): DiagramNode[] {
    if (!this.index.findById(nodeId)) return [];
    const visited = new Set<string>([nodeId]);
    const queue = [nodeId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const e of this.index.getIncoming(cur)) {
        if (!visited.has(e.source)) { visited.add(e.source); queue.push(e.source); }
      }
    }
    visited.delete(nodeId);
    return [...visited].map(id => this.index.findById(id)).filter(Boolean) as DiagramNode[];
  }

  search(query: string, limit = 50): DiagramNode[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.diagram.nodes.filter(n =>
      n.label.toLowerCase().includes(q) || (n.sublabel?.toLowerCase().includes(q) ?? false) || n.id.toLowerCase().includes(q)
    ).slice(0, limit);
  }

  getStats() {
    const degrees = new Map<string, number>();
    for (const n of this.diagram.nodes) degrees.set(n.id, 0);
    for (const e of this.diagram.edges) {
      degrees.set(e.source, (degrees.get(e.source) ?? 0) + 1);
      degrees.set(e.target, (degrees.get(e.target) ?? 0) + 1);
    }
    const avgDegree = this.diagram.edges.length * 2 / Math.max(this.diagram.nodes.length, 1);
    const cycles = this.findCycles();
    let maxDepth = 0;
    // BFS depth from each node — simple approximation
    for (const start of this.diagram.nodes.slice(0, 20)) {
      const visited = new Set<string>([start.id]);
      const queue: Array<{ id: string; depth: number }> = [{ id: start.id, depth: 0 }];
      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        maxDepth = Math.max(maxDepth, depth);
        for (const e of this.index.getOutgoing(id)) {
          if (!visited.has(e.target)) { visited.add(e.target); queue.push({ id: e.target, depth: depth + 1 }); }
        }
      }
    }
    return {
      nodeCount: this.diagram.nodes.length,
      edgeCount: this.diagram.edges.length,
      cycleCount: cycles.length,
      avgDegree: Number(avgDegree.toFixed(2)),
      maxDepth,
      connectedComponents: this.countComponents(),
    };
  }

  private countComponents(): number {
    const visited = new Set<string>();
    let count = 0;
    for (const n of this.diagram.nodes) {
      if (visited.has(n.id)) continue;
      count++;
      const queue = [n.id];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        for (const e of this.index.getOutgoing(cur)) if (!visited.has(e.target)) queue.push(e.target);
        for (const e of this.index.getIncoming(cur)) if (!visited.has(e.source)) queue.push(e.source);
      }
    }
    return count;
  }
}
