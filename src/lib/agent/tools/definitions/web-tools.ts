// CodeInsight AI — Stage 4: Web Agent Tools (Layer 4)
// 9 tools for internet research: web search, package ecosystems, GitHub,
// StackOverflow, CVE, and page reader. Uses z-ai-web-dev-sdk.
//
// SDK: z-ai-web-dev-sdk (ZAI.create() — no API key needed for web_search/page_reader)
// All tools are read-only (permission: "allow") and cacheable (5 min TTL).

import type { Tool, Result, AgentContext } from "../../contracts";
import { readOnlyManifest } from "../manifest";

function ok<T>(value: T): Result<T> { return { ok: true, value }; }
function err(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message, recoverable: false } };
}

function requireParam(params: Record<string, unknown>, name: string): string | null {
  const val = params[name];
  if (typeof val !== "string" || !val) return null;
  return val;
}

/** Interface for web search result items from z-ai-web-dev-sdk */
interface SearchResultItem {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  rank: number;
  date: string;
  favicon: string;
}

/**
 * Core web search function — calls z-ai-web-dev-sdk.
 * Shared by all search tools (web-search, github-search, npm-search, etc.)
 */
async function doWebSearch(query: string, num: number = 10): Promise<Result<SearchResultItem[]>> {
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const searchResult = await zai.functions.invoke("web_search", { query, num });

    if (!Array.isArray(searchResult)) {
      return err("TOOL_EXECUTION_FAILED", "Web search returned unexpected format");
    }
    return ok(searchResult as SearchResultItem[]);
  } catch (e) {
    return err("TOOL_EXECUTION_FAILED", `Web search failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Read a web page and extract its content.
 * Uses z-ai-web-dev-sdk page_reader function.
 */
async function doReadPage(url: string): Promise<Result<{ title: string; content: string; url: string }>> {
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const result = await zai.functions.invoke("page_reader", { url });

    const data = (result as any)?.data;
    if (!data) {
      return err("TOOL_EXECUTION_FAILED", "Page reader returned no data");
    }

    // Extract text content from HTML (improved stripping — preserves code blocks)
    const html: string = data.html || "";
    const title: string = data.title || "";
    // Improved HTML-to-text:
    // - Remove script/style/noscript/template tags + content
    // - Remove HTML comments
    // - Preserve <pre> and <code> content with newlines (formatting matters for docs)
    // - Convert <br>, </p>, </div>, </li> to newlines
    // - Convert <li> to bullet "• "
    // - Strip remaining tags
    // - Decode common HTML entities
    // - Collapse excessive whitespace (but preserve newlines in code blocks)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
      .replace(/<template[^>]*>[\s\S]*?<\/template>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      // Preserve code blocks: mark <pre>/<code> content with markers
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m: string, c: string) => "\n```\n" + c.replace(/<[^>]+>/g, "") + "\n```\n")
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m: string, c: string) => "`" + c.replace(/<[^>]+>/g, "") + "`")
      // Convert block-level closers to newlines
      .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      // Strip all remaining tags
      .replace(/<[^>]+>/g, "")
      // Decode HTML entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&hellip;/g, "…")
      .replace(/&mdash;/g, "—")
      .replace(/&ndash;/g, "–")
      // Collapse 3+ newlines to 2, trim trailing spaces per line
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    // Cap content to ~5000 chars (roughly 1250 tokens) to avoid context overflow
    const cappedContent = textContent.slice(0, 5000);

    return ok({ title, content: cappedContent, url: data.url || url });
  } catch (e) {
    return err("TOOL_EXECUTION_FAILED", `Page reader failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Format search results into a readable string */
function formatSearchResults(results: SearchResultItem[]): string {
  if (results.length === 0) return "No results found.";
  return results.map((r, i) =>
    `${i + 1}. ${r.name}\n   URL: ${r.url}\n   Snippet: ${r.snippet}\n   Date: ${r.date || "n/a"}`,
  ).join("\n\n");
}

// ─── 1. web-search (Google) ───
export const webSearchTool: Tool = {
  manifest: readOnlyManifest("web-search", "Search the web (Google) for real-time information", ["web-search"], {
    cost: "cheap",
    estimatedTimeMs: 3000,
    timeout: 15000,
    cacheable: true,
    cacheTtl: 300000, // 5 min
    inputSchema: { type: "object", properties: { query: { type: "string" }, num: { type: "number" } }, required: ["query"] },
  }),
  async execute(params) {
    const query = requireParam(params, "query");
    if (!query) return err("TOOL_INVALID_PARAMS", "Missing required param: query");
    const num = typeof params.num === "number" ? Math.min(params.num, 20) : 10;

    const result = await doWebSearch(query, num);
    if (!result.ok) return result;

    return ok({
      query,
      count: result.value.length,
      results: result.value,
      formatted: formatSearchResults(result.value),
    });
  },
};

// ─── 2. github-search ───
export const githubSearchTool: Tool = {
  manifest: readOnlyManifest("github-search", "Search GitHub for repositories, issues, and code", ["github-search"], {
    cost: "cheap",
    estimatedTimeMs: 3000,
    timeout: 15000,
    cacheable: true,
    cacheTtl: 300000,
    inputSchema: { type: "object", properties: { query: { type: "string" }, num: { type: "number" } }, required: ["query"] },
  }),
  async execute(params) {
    const query = requireParam(params, "query");
    if (!query) return err("TOOL_INVALID_PARAMS", "Missing required param: query");
    const num = typeof params.num === "number" ? Math.min(params.num, 20) : 10;

    // Site-specific search: site:github.com
    const result = await doWebSearch(`site:github.com ${query}`, num);
    if (!result.ok) return result;

    return ok({
      query,
      count: result.value.length,
      results: result.value,
      formatted: formatSearchResults(result.value),
    });
  },
};

// ─── 3. stackoverflow-search ───
export const stackoverflowSearchTool: Tool = {
  manifest: readOnlyManifest("stackoverflow-search", "Search StackOverflow for programming Q&A", ["stackoverflow-search"], {
    cost: "cheap",
    estimatedTimeMs: 3000,
    timeout: 15000,
    cacheable: true,
    cacheTtl: 300000,
    inputSchema: { type: "object", properties: { query: { type: "string" }, num: { type: "number" } }, required: ["query"] },
  }),
  async execute(params) {
    const query = requireParam(params, "query");
    if (!query) return err("TOOL_INVALID_PARAMS", "Missing required param: query");
    const num = typeof params.num === "number" ? Math.min(params.num, 20) : 10;

    const result = await doWebSearch(`site:stackoverflow.com ${query}`, num);
    if (!result.ok) return result;

    return ok({
      query,
      count: result.value.length,
      results: result.value,
      formatted: formatSearchResults(result.value),
    });
  },
};

// ─── 4. npm-search ───
export const npmSearchTool: Tool = {
  manifest: readOnlyManifest("npm-search", "Search npm for Node.js packages", ["npm-search"], {
    cost: "cheap",
    estimatedTimeMs: 3000,
    timeout: 15000,
    cacheable: true,
    cacheTtl: 300000,
    inputSchema: { type: "object", properties: { query: { type: "string" }, num: { type: "number" } }, required: ["query"] },
  }),
  async execute(params) {
    const query = requireParam(params, "query");
    if (!query) return err("TOOL_INVALID_PARAMS", "Missing required param: query");
    const num = typeof params.num === "number" ? Math.min(params.num, 20) : 10;

    const result = await doWebSearch(`site:npmjs.com ${query}`, num);
    if (!result.ok) return result;

    return ok({
      query,
      count: result.value.length,
      results: result.value,
      formatted: formatSearchResults(result.value),
    });
  },
};

// ─── 5. crate-search (Rust) ───
export const crateSearchTool: Tool = {
  manifest: readOnlyManifest("crate-search", "Search crates.io for Rust packages", ["crate-search"], {
    cost: "cheap",
    estimatedTimeMs: 3000,
    timeout: 15000,
    cacheable: true,
    cacheTtl: 300000,
    inputSchema: { type: "object", properties: { query: { type: "string" }, num: { type: "number" } }, required: ["query"] },
  }),
  async execute(params) {
    const query = requireParam(params, "query");
    if (!query) return err("TOOL_INVALID_PARAMS", "Missing required param: query");
    const num = typeof params.num === "number" ? Math.min(params.num, 20) : 10;

    const result = await doWebSearch(`site:crates.io ${query}`, num);
    if (!result.ok) return result;

    return ok({
      query,
      count: result.value.length,
      results: result.value,
      formatted: formatSearchResults(result.value),
    });
  },
};

// ─── 6. nuget-search (.NET) ───
export const nugetSearchTool: Tool = {
  manifest: readOnlyManifest("nuget-search", "Search nuget.org for .NET packages", ["nuget-search"], {
    cost: "cheap",
    estimatedTimeMs: 3000,
    timeout: 15000,
    cacheable: true,
    cacheTtl: 300000,
    inputSchema: { type: "object", properties: { query: { type: "string" }, num: { type: "number" } }, required: ["query"] },
  }),
  async execute(params) {
    const query = requireParam(params, "query");
    if (!query) return err("TOOL_INVALID_PARAMS", "Missing required param: query");
    const num = typeof params.num === "number" ? Math.min(params.num, 20) : 10;

    const result = await doWebSearch(`site:nuget.org ${query}`, num);
    if (!result.ok) return result;

    return ok({
      query,
      count: result.value.length,
      results: result.value,
      formatted: formatSearchResults(result.value),
    });
  },
};

// ─── 7. pypi-search (Python) ───
export const pypiSearchTool: Tool = {
  manifest: readOnlyManifest("pypi-search", "Search pypi.org for Python packages", ["pypi-search"], {
    cost: "cheap",
    estimatedTimeMs: 3000,
    timeout: 15000,
    cacheable: true,
    cacheTtl: 300000,
    inputSchema: { type: "object", properties: { query: { type: "string" }, num: { type: "number" } }, required: ["query"] },
  }),
  async execute(params) {
    const query = requireParam(params, "query");
    if (!query) return err("TOOL_INVALID_PARAMS", "Missing required param: query");
    const num = typeof params.num === "number" ? Math.min(params.num, 20) : 10;

    const result = await doWebSearch(`site:pypi.org ${query}`, num);
    if (!result.ok) return result;

    return ok({
      query,
      count: result.value.length,
      results: result.value,
      formatted: formatSearchResults(result.value),
    });
  },
};

// ─── 8. read-docs (page reader) ───
export const readDocsTool: Tool = {
  manifest: readOnlyManifest("read-docs", "Read the content of a web page (API docs, blog post, etc.)", ["read-docs"], {
    cost: "cheap",
    estimatedTimeMs: 5000,
    timeout: 20000,
    cacheable: true,
    cacheTtl: 600000, // 10 min (docs don't change often)
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  }),
  async execute(params) {
    const url = requireParam(params, "url");
    if (!url) return err("TOOL_INVALID_PARAMS", "Missing required param: url");

    const result = await doReadPage(url);
    if (!result.ok) return result;

    return ok({
      url: result.value.url,
      title: result.value.title,
      content: result.value.content,
      tokens: Math.ceil(result.value.content.length / 4),
    });
  },
};

// ─── 9. cve-search (security vulnerabilities) ───
export const cveSearchTool: Tool = {
  manifest: readOnlyManifest("cve-search", "Search for CVE vulnerabilities (NVD + MITRE)", ["cve-search"], {
    cost: "cheap",
    estimatedTimeMs: 3000,
    timeout: 15000,
    cacheable: true,
    cacheTtl: 300000,
    inputSchema: { type: "object", properties: { query: { type: "string" }, num: { type: "number" } }, required: ["query"] },
  }),
  async execute(params) {
    const query = requireParam(params, "query");
    if (!query) return err("TOOL_INVALID_PARAMS", "Missing required param: query");
    const num = typeof params.num === "number" ? Math.min(params.num, 20) : 10;

    // Search NVD + MITRE for CVEs
    const result = await doWebSearch(`site:nvd.nist.gov OR site:cve.mitre.org ${query}`, num);
    if (!result.ok) return result;

    return ok({
      query,
      count: result.value.length,
      results: result.value,
      formatted: formatSearchResults(result.value),
    });
  },
};

// Export all web tools
export const webTools: Tool[] = [
  webSearchTool,
  githubSearchTool,
  stackoverflowSearchTool,
  npmSearchTool,
  crateSearchTool,
  nugetSearchTool,
  pypiSearchTool,
  readDocsTool,
  cveSearchTool,
];
