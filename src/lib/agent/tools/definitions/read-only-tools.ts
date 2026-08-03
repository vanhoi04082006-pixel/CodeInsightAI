// CodeInsight AI — Tool Definitions: Read-only queries (Layer 4)
// 13 read-only tools that wrap the SemanticQueryService.

import type { Tool, Result, AgentContext } from "../../contracts";
import { readOnlyManifest } from "../manifest";

function err(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message, recoverable: false } };
}

// Helper to extract required param
function requireParam(params: Record<string, unknown>, name: string): string | null {
  const val = params[name];
  if (typeof val !== "string" || !val) return null;
  return val;
}

// ─── find-symbol ───
export const findSymbolTool: Tool = {
  manifest: readOnlyManifest("find-symbol", "Find symbols by name in the project", ["find-symbol"], {
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  }),
  async execute(params, ctx: AgentContext) {
    const name = requireParam(params, "name");
    if (!name) return err("TOOL_INVALID_PARAMS", "Missing required param: name");
    return ctx.query.findSymbol(name);
  },
};

// ─── find-references ───
export const findReferencesTool: Tool = {
  manifest: readOnlyManifest("find-references", "Find all references to a symbol", ["find-references"], {
    inputSchema: { type: "object", properties: { symbolId: { type: "string" } }, required: ["symbolId"] },
  }),
  async execute(params, ctx: AgentContext) {
    const symbolId = requireParam(params, "symbolId");
    if (!symbolId) return err("TOOL_INVALID_PARAMS", "Missing required param: symbolId");
    return ctx.query.findReferences(symbolId);
  },
};

// ─── find-call-chain ───
export const findCallChainTool: Tool = {
  manifest: readOnlyManifest("find-call-chain", "Find call chain from an entry point", ["find-call-chain"], {
    estimatedTimeMs: 200,
    inputSchema: { type: "object", properties: { entry: { type: "string" }, maxDepth: { type: "number" } }, required: ["entry"] },
  }),
  async execute(params, ctx: AgentContext) {
    const entry = requireParam(params, "entry");
    if (!entry) return err("TOOL_INVALID_PARAMS", "Missing required param: entry");
    const maxDepth = typeof params.maxDepth === "number" ? params.maxDepth : 5;
    return ctx.query.findCallChain(entry, maxDepth);
  },
};

// ─── find-impact ───
export const findImpactTool: Tool = {
  manifest: readOnlyManifest("find-impact", "Analyze impact of changing a symbol", ["find-impact"], {
    estimatedTimeMs: 300,
    inputSchema: { type: "object", properties: { symbolId: { type: "string" } }, required: ["symbolId"] },
  }),
  async execute(params, ctx: AgentContext) {
    const symbolId = requireParam(params, "symbolId");
    if (!symbolId) return err("TOOL_INVALID_PARAMS", "Missing required param: symbolId");
    return ctx.query.findImpact(symbolId);
  },
};

// ─── search-code ───
export const searchCodeTool: Tool = {
  manifest: readOnlyManifest("search-code", "Search file contents for a query", ["search-code"], {
    estimatedTimeMs: 500,
    inputSchema: { type: "object", properties: { query: { type: "string" }, regex: { type: "boolean" }, language: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
  }),
  async execute(params, ctx: AgentContext) {
    const query = requireParam(params, "query");
    if (!query) return err("TOOL_INVALID_PARAMS", "Missing required param: query");
    return ctx.query.searchCode(query, {
      regex: typeof params.regex === "boolean" ? params.regex : false,
      language: typeof params.language === "string" ? params.language : undefined,
      limit: typeof params.limit === "number" ? params.limit : 50,
    });
  },
};

// ─── open-file / read-file ───
export const openFileTool: Tool = {
  manifest: readOnlyManifest("open-file", "Open and read a file", ["open-file", "read-file"], {
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  }),
  async execute(params, ctx: AgentContext) {
    const path = requireParam(params, "path");
    if (!path) return err("TOOL_INVALID_PARAMS", "Missing required param: path");
    return ctx.query.findFile(path);
  },
};

// ─── find-dead-code ───
export const findDeadCodeTool: Tool = {
  manifest: readOnlyManifest("find-dead-code", "Find dead code (unreferenced symbols)", ["find-dead-code"], {
    estimatedTimeMs: 200,
  }),
  async execute(_params, ctx: AgentContext) {
    return ctx.query.findDeadCode();
  },
};

// ─── find-duplicates ───
export const findDuplicatesTool: Tool = {
  manifest: readOnlyManifest("find-duplicates", "Find duplicate code groups", ["find-duplicates"]),
  async execute(_params, ctx: AgentContext) {
    return ctx.query.findDuplicates();
  },
};

// ─── find-issues ───
export const findIssuesTool: Tool = {
  manifest: readOnlyManifest("find-issues", "Find issues filtered by category/severity/file", ["find-issues"], {
    inputSchema: { type: "object", properties: { category: { type: "string" }, severity: { type: "string" }, file: { type: "string" } }, required: [] },
  }),
  async execute(params, ctx: AgentContext) {
    return ctx.query.findIssues({
      category: typeof params.category === "string" ? params.category as any : undefined,
      severity: typeof params.severity === "string" ? params.severity as any : undefined,
      file: typeof params.file === "string" ? params.file : undefined,
    });
  },
};

// ─── find-architecture ───
export const findArchitectureTool: Tool = {
  manifest: readOnlyManifest("find-architecture", "Get architecture overview", ["find-architecture"]),
  async execute(_params, ctx: AgentContext) {
    return ctx.query.getArchitecture();
  },
};

// ─── find-metrics ───
export const findMetricsTool: Tool = {
  manifest: readOnlyManifest("find-metrics", "Get project metrics", ["find-metrics"]),
  async execute(_params, ctx: AgentContext) {
    return ctx.query.getMetrics();
  },
};

// ─── find-circular-deps ───
export const findCircularDepsTool: Tool = {
  manifest: readOnlyManifest("find-circular-deps", "Find circular dependencies", ["find-circular-deps"], {
    estimatedTimeMs: 300,
  }),
  async execute(_params, ctx: AgentContext) {
    return ctx.query.findCircularDependencies();
  },
};

// ─── get-diagram ───
export const getDiagramTool: Tool = {
  manifest: readOnlyManifest("get-diagram", "Get diagram data for visualization", ["get-diagram"], {
    estimatedTimeMs: 500,
    inputSchema: { type: "object", properties: { type: { type: "string" }, layout: { type: "string" }, focus: { type: "string" } }, required: ["type"] },
  }),
  async execute(params, ctx: AgentContext) {
    const type = requireParam(params, "type");
    if (!type) return err("TOOL_INVALID_PARAMS", "Missing required param: type");
    return ctx.query.getDiagram(type, {
      layout: typeof params.layout === "string" ? params.layout as any : undefined,
      focus: typeof params.focus === "string" ? params.focus : undefined,
    });
  },
};

// Export all read-only tools
export const readOnlyTools: Tool[] = [
  findSymbolTool,
  findReferencesTool,
  findCallChainTool,
  findImpactTool,
  searchCodeTool,
  openFileTool,
  findDeadCodeTool,
  findDuplicatesTool,
  findIssuesTool,
  findArchitectureTool,
  findMetricsTool,
  findCircularDepsTool,
  getDiagramTool,
];
