/**
 * Smoke tests for core utility modules.
 * These verify that key business logic functions work correctly.
 */

describe("Crypto (AES-256-GCM)", () => {
  it("should encrypt and decrypt a string", async () => {
    const { encrypt, decrypt, maskApiKey } = await import("@/lib/crypto");
    const plaintext = "sk-test-key-12345";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
    expect(encrypted).not.toBe(plaintext);
  });

  it("should mask API keys correctly", async () => {
    const { maskApiKey } = await import("@/lib/crypto");
    expect(maskApiKey("sk-1234567890abcdef")).toBe("sk-1•••••••••••cdef");
    expect(maskApiKey("short")).toBe("••••••••");
  });
});

describe("Billing / Usage limits", () => {
  it("should have correct plan limits", async () => {
    const { PLAN_LIMITS } = await import("@/lib/billing/usage");
    expect(PLAN_LIMITS.free.analysesPerMonth).toBe(5);
    expect(PLAN_LIMITS.pro.analysesPerMonth).toBe(100);
    expect(PLAN_LIMITS.team.analysesPerMonth).toBe(500);
    expect(PLAN_LIMITS.enterprise.analysesPerMonth).toBe(-1); // unlimited
    expect(PLAN_LIMITS.free.streaming).toBe(false);
    expect(PLAN_LIMITS.pro.streaming).toBe(true);
  });

  it("should generate correct month key", async () => {
    const { getMonthKey } = await import("@/lib/billing/usage");
    const key = getMonthKey();
    expect(key).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("Repo URL Parser", () => {
  it("should parse valid GitHub URLs", async () => {
    const { parseRepoUrl } = await import("@/lib/analysis-engine");
    const result = parseRepoUrl("https://github.com/vercel/next.js");
    expect(result.valid).toBe(true);
    expect(result.owner).toBe("vercel");
    expect(result.name).toBe("next.js");
  });

  it("should reject invalid URLs", async () => {
    const { parseRepoUrl } = await import("@/lib/analysis-engine");
    expect(parseRepoUrl("not-a-url").valid).toBe(false);
    expect(parseRepoUrl("https://example.com/test").valid).toBe(false);
  });
});

describe("CodeGraph Builder", () => {
  it("should build a graph from parsed repo", async () => {
    const { buildCodeGraph, getGraphStats } = await import("@/lib/codegraph/builder");
    const mockRepo = {
      owner: "test",
      name: "repo",
      url: "https://github.com/test/repo",
      totalFiles: 2,
      totalLines: 100,
      languages: [{ name: "TypeScript", percentage: 100, color: "#3178c6", files: 2, lines: 100 }],
      frameworks: [],
      files: [
        {
          path: "src/index.ts",
          language: "TypeScript",
          lines: 50,
          complexity: 5,
          description: "Entry point",
          imports: ["./utils"],
          exports: ["main"],
          functions: ["main"],
          classes: [],
          components: [],
          routes: [],
        },
        {
          path: "src/utils.ts",
          language: "TypeScript",
          lines: 50,
          complexity: 3,
          description: "Utilities",
          imports: [],
          exports: ["helper"],
          functions: ["helper"],
          classes: [],
          components: [],
          routes: [],
        },
      ],
    };
    const graph = buildCodeGraph(mockRepo as any);
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
    const stats = getGraphStats(graph);
    expect(stats.totalNodes).toBeGreaterThan(0);
    expect(stats.totalEdges).toBeGreaterThan(0);
  });
});
