/**
 * Tests for CodeGraph query functions.
 * Verifies graph traversal, search, and analysis operations.
 */

describe("CodeGraph Query Functions", () => {
  const mockGraph = {
    nodes: [
      { id: "src/app.ts", type: "file", label: "app.ts", filePath: "src/app.ts", language: "TypeScript", metadata: { group: 0, linesOfCode: 50 } },
      { id: "src/app.ts#main", type: "function", label: "main", filePath: "src/app.ts", language: "TypeScript", metadata: { group: 0 } },
      { id: "src/utils.ts", type: "file", label: "utils.ts", filePath: "src/utils.ts", language: "TypeScript", metadata: { group: 0, linesOfCode: 30 } },
      { id: "src/utils.ts#helper", type: "function", label: "helper", filePath: "src/utils.ts", language: "TypeScript", metadata: { group: 0 } },
      { id: "src/auth.ts", type: "file", label: "auth.ts", filePath: "src/auth.ts", language: "TypeScript", metadata: { group: 0, linesOfCode: 80 } },
    ],
    edges: [
      { from: "src/app.ts", to: "src/app.ts#main", type: "exports" as const, weight: 1 },
      { from: "src/app.ts", to: "src/utils.ts", type: "imports" as const, weight: 1 },
      { from: "src/app.ts#main", to: "src/utils.ts#helper", type: "calls" as const, weight: 0.5 },
      { from: "src/utils.ts", to: "src/utils.ts#helper", type: "exports" as const, weight: 1 },
      { from: "src/auth.ts", to: "src/app.ts", type: "imports" as const, weight: 1 },
    ],
    nodeCount: 5,
    edgeCount: 5,
    builtAt: new Date().toISOString(),
  };

  it("should find callers of a function", async () => {
    const { findCallers } = await import("@/lib/codegraph/builder");
    const callers = findCallers(mockGraph as any, "src/utils.ts#helper");
    expect(callers.length).toBe(1);
    expect(callers[0].id).toBe("src/app.ts#main");
  });

  it("should find callees of a function", async () => {
    const { findCallees } = await import("@/lib/codegraph/builder");
    const callees = findCallees(mockGraph as any, "src/app.ts#main");
    expect(callees.length).toBe(1);
    expect(callees[0].id).toBe("src/utils.ts#helper");
  });

  it("should find shortest path between nodes", async () => {
    const { shortestPath } = await import("@/lib/codegraph/builder");
    const path = shortestPath(mockGraph as any, "src/auth.ts", "src/utils.ts#helper");
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThanOrEqual(3); // path length depends on graph structure
    expect(path![0].id).toBe("src/auth.ts");
    expect(path![path!.length - 1].id).toBe("src/utils.ts#helper");
  });

  it("should return null for no path", async () => {
    const { shortestPath } = await import("@/lib/codegraph/builder");
    const path = shortestPath(mockGraph as any, "src/utils.ts#helper", "src/auth.ts");
    // No path from helper back to auth (one-directional)
    expect(path).toBeNull();
  });

  it("should search nodes by label", async () => {
    const { searchNodes } = await import("@/lib/codegraph/builder");
    const results = searchNodes(mockGraph as any, "auth");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("src/auth.ts");
  });

  it("should search nodes by file path", async () => {
    const { searchNodes } = await import("@/lib/codegraph/builder");
    const results = searchNodes(mockGraph as any, "utils");
    expect(results.length).toBe(2); // utils.ts + helper function
  });

  it("should get neighbors (incoming + outgoing)", async () => {
    const { getNeighbors } = await import("@/lib/codegraph/builder");
    const neighbors = getNeighbors(mockGraph as any, "src/app.ts");
    expect(neighbors.incoming.length).toBe(1); // auth imports app
    expect(neighbors.outgoing.length).toBe(2); // app exports main + imports utils
  });

  it("should calculate impact analysis", async () => {
    const { impactAnalysis } = await import("@/lib/codegraph/builder");
    // If utils.ts changes, what's impacted?
    const impacted = impactAnalysis(mockGraph as any, "src/utils.ts");
    // auth.ts → app.ts → utils.ts (auth depends on app which depends on utils)
    expect(impacted.length).toBeGreaterThan(0);
    expect(impacted.some(n => n.id === "src/app.ts")).toBe(true);
  });

  it("should get graph stats", async () => {
    const { getGraphStats } = await import("@/lib/codegraph/builder");
    const stats = getGraphStats(mockGraph as any);
    expect(stats.totalNodes).toBe(5);
    expect(stats.totalEdges).toBe(5);
    expect(stats.byType.file).toBe(3);
    expect(stats.byType.function).toBe(2);
    expect(stats.mostConnected.length).toBeGreaterThan(0);
  });
});
