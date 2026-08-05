// CodeInsight AI — Stage 4: Web Tools Tests
// Tests for the 9 web research tools (web-search, github-search, etc.)

import { createRegistries } from "@/lib/agent/tools";
import { ToolRegistryImpl } from "@/lib/agent/tools/tool-registry";
import {
  webSearchTool,
  githubSearchTool,
  stackoverflowSearchTool,
  npmSearchTool,
  crateSearchTool,
  nugetSearchTool,
  pypiSearchTool,
  readDocsTool,
  cveSearchTool,
  webTools,
} from "@/lib/agent/tools/definitions/web-tools";

describe("Stage 4 — Web Tools Registration", () => {
  const { toolRegistry } = createRegistries();

  it("should register all 9 web tools", () => {
    expect(webTools).toHaveLength(9);
    expect(toolRegistry.get("web-search")).toBeDefined();
    expect(toolRegistry.get("github-search")).toBeDefined();
    expect(toolRegistry.get("stackoverflow-search")).toBeDefined();
    expect(toolRegistry.get("npm-search")).toBeDefined();
    expect(toolRegistry.get("crate-search")).toBeDefined();
    expect(toolRegistry.get("nuget-search")).toBeDefined();
    expect(toolRegistry.get("pypi-search")).toBeDefined();
    expect(toolRegistry.get("read-docs")).toBeDefined();
    expect(toolRegistry.get("cve-search")).toBeDefined();
  });

  it("total tools should be 35 (26 + 9 web)", () => {
    expect((toolRegistry as ToolRegistryImpl).count()).toBe(35);
  });

  it("all web tools should have permission 'allow' (read-only)", () => {
    for (const tool of webTools) {
      expect(tool.manifest.permission).toBe("allow");
    }
  });

  it("all web tools should be cacheable", () => {
    for (const tool of webTools) {
      expect(tool.manifest.cacheable).toBe(true);
      expect(tool.manifest.cacheTtl).toBeGreaterThan(0);
    }
  });

  it("all web tools should have timeout >= 15000ms", () => {
    for (const tool of webTools) {
      expect(tool.manifest.timeout).toBeGreaterThanOrEqual(15000);
    }
  });

  it("all web tools should have inputSchema with required params", () => {
    for (const tool of webTools) {
      expect(tool.manifest.inputSchema).toBeDefined();
      expect(tool.manifest.inputSchema.type).toBe("object");
      expect(tool.manifest.inputSchema.required.length).toBeGreaterThan(0);
    }
  });

  it("search tools should require 'query' param", () => {
    const searchTools = [webSearchTool, githubSearchTool, stackoverflowSearchTool, npmSearchTool, crateSearchTool, nugetSearchTool, pypiSearchTool, cveSearchTool];
    for (const tool of searchTools) {
      expect(tool.manifest.inputSchema.required).toContain("query");
    }
  });

  it("read-docs should require 'url' param", () => {
    expect(readDocsTool.manifest.inputSchema.required).toContain("url");
  });
});

describe("Stage 4 — Web Tools Execute (real SDK)", () => {
  it("web-search should return results for a query", async () => {
    const result = await webSearchTool.execute({ query: "node.js express", num: 3 }, {} as any);
    if (result.ok) {
      expect((result.value as any).count).toBeGreaterThan(0);
      expect((result.value as any).results[0]).toHaveProperty("url");
    } else {
      expect(result.error.code).toBe("TOOL_EXECUTION_FAILED");
    }
  }, 30000);

  it("web-search should reject empty query", async () => {
    const result = await webSearchTool.execute({ query: "" }, {} as any);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TOOL_INVALID_PARAMS");
  });

  it("github-search should work with site prefix", async () => {
    const result = await githubSearchTool.execute({ query: "react", num: 2 }, {} as any);
    if (result.ok) expect((result.value as any).count).toBeGreaterThan(0);
    else expect(result.error.code).toBe("TOOL_EXECUTION_FAILED");
  }, 30000);

  it("npm-search should work with site prefix", async () => {
    const result = await npmSearchTool.execute({ query: "express", num: 2 }, {} as any);
    if (result.ok) expect((result.value as any).count).toBeGreaterThan(0);
    else expect(result.error.code).toBe("TOOL_EXECUTION_FAILED");
  }, 30000);

  it("cve-search should work with site prefix", async () => {
    const result = await cveSearchTool.execute({ query: "express vulnerability", num: 2 }, {} as any);
    if (result.ok) expect((result.value as any).count).toBeGreaterThan(0);
    else expect(result.error.code).toBe("TOOL_EXECUTION_FAILED");
  }, 30000);

  it("read-docs should extract content from a URL", async () => {
    const result = await readDocsTool.execute({ url: "https://example.com" }, {} as any);
    if (result.ok) {
      expect((result.value as any).title).toBeDefined();
      expect((result.value as any).content.length).toBeGreaterThan(0);
    } else {
      expect(result.error.code).toBe("TOOL_EXECUTION_FAILED");
    }
  }, 30000);

  it("read-docs should reject empty url", async () => {
    const result = await readDocsTool.execute({ url: "" }, {} as any);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TOOL_INVALID_PARAMS");
  });

  it("read-docs should cap content to 5000 chars", async () => {
    const result = await readDocsTool.execute({ url: "https://example.com" }, {} as any);
    if (result.ok) expect((result.value as any).content.length).toBeLessThanOrEqual(5000);
  }, 30000);

  it("search results should include 'formatted' field", async () => {
    const result = await webSearchTool.execute({ query: "test", num: 2 }, {} as any);
    if (result.ok) expect(typeof (result.value as any).formatted).toBe("string");
  }, 30000);
});

describe("Stage 4 — Capability Registry", () => {
  const { capabilityRegistry } = createRegistries();

  it("should resolve all 9 web capabilities", () => {
    const webCaps = ["web-search", "github-search", "stackoverflow-search", "npm-search", "crate-search", "nuget-search", "pypi-search", "read-docs", "cve-search"];
    for (const cap of webCaps) {
      expect(capabilityRegistry.resolve(cap as any)).not.toBeNull();
    }
  });
});
