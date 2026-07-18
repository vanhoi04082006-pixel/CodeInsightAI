// CodeInsight AI — Plugin SDK: Notion plugin
// Concrete plugin for Notion integration. Implements real REST API calls
// against https://api.notion.com/v1/* using fetch() with 30s timeout,
// Bearer token auth, and the 2022-06-28 Notion-Version header.

import {
  Plugin,
  type PluginContext,
  type PluginManifest,
  type PluginAction,
} from "../types";

const ACTIONS: PluginAction[] = [
  {
    name: "search",
    description: "Search pages and databases by title or content.",
    params: { query: { type: "string", required: true } },
    result: { type: "array", description: "Matching pages/databases" },
  },
  {
    name: "get-page",
    description: "Get a page (properties + blocks) by ID.",
    params: { pageId: { type: "string", required: true } },
    result: { type: "object", description: "Page metadata + content" },
  },
  {
    name: "get-database",
    description: "Get a database schema by ID.",
    params: { databaseId: { type: "string", required: true } },
    result: { type: "object", description: "Database schema" },
  },
  {
    name: "query-database",
    description: "Query rows from a database with optional filters.",
    params: {
      databaseId: { type: "string", required: true },
      filter: { type: "string", description: "Notion filter JSON" },
    },
    result: { type: "array", description: "Matching pages" },
  },
  {
    name: "create-page",
    description: "Create a new page in a database.",
    params: {
      databaseId: { type: "string", required: true },
      title: { type: "string", required: true },
      properties: { type: "string", description: "Optional properties JSON" },
    },
    result: { type: "object", description: "Created page metadata" },
  },
  {
    name: "append-blocks",
    description: "Append blocks to an existing page or block.",
    params: {
      blockId: { type: "string", required: true },
      blocks: { type: "string", required: true, description: "Blocks JSON array" },
    },
    result: { type: "array", description: "Appended blocks" },
  },
];

const MANIFEST: PluginManifest = {
  id: "notion",
  name: "Notion",
  version: "1.0.0",
  description: "Read and write Notion pages and databases.",
  icon: "FileText",
  color: "#000000",
  category: "notes",
  capabilities: [
    { kind: "read", description: "Read pages, databases, blocks" },
    { kind: "write", description: "Create pages, append blocks" },
    { kind: "search", description: "Search pages by title or content" },
  ],
  configSchema: {
    integrationToken: { type: "string", secret: true, required: true, label: "Internal Integration Token" },
    databaseId: { type: "string", label: "Default database ID" },
  },
  actions: ACTIONS,
};

// ────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const NOTION_VERSION = "2022-06-28";

// Actions exposed beyond the manifest's ACTIONS array (still supported by
// execute() but not advertised in the UI catalog).
// - "search-pages" is an alias of "search"
// - "get-databases" lists databases via /search with an object filter
const EXTRA_ACTIONS = new Set(["search-pages", "get-databases"]);

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function isStringRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extractApiError(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 500);
  if (isStringRecord(body)) {
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
  }
  try {
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return String(body).slice(0, 500);
  }
}

/** Parse a JSON string or pass through an already-parsed object/array. */
function parseJsonParam(raw: unknown, fieldName: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw === "string") {
    if (raw.trim() === "") return { ok: true, value: undefined };
    try {
      return { ok: true, value: JSON.parse(raw) as unknown };
    } catch {
      return { ok: false, error: `${fieldName} must be valid JSON` };
    }
  }
  // Already parsed
  return { ok: true, value: raw };
}

async function notionRequest(
  url: string,
  token: string,
  init: { method?: string; body?: string } = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: init.body,
      signal: controller.signal,
    });
    if (!res.ok) {
      let errBody: unknown = null;
      try {
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          errBody = await res.json();
        } else {
          errBody = await res.text();
        }
      } catch {
        errBody = null;
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Notion authentication failed (${res.status}). Verify the integration token and that the page/database is shared with the integration. Details: ${extractApiError(errBody)}`,
        );
      }
      if (res.status === 404) {
        throw new Error(
          `Notion resource not found (404) at ${url}. Verify the ID and that the resource is shared with the integration.`,
        );
      }
      if (res.status === 429) {
        throw new Error(
          `Notion rate limit hit (429). Wait and retry. Details: ${extractApiError(errBody)}`,
        );
      }
      throw new Error(`Notion API ${res.status} ${res.statusText}: ${extractApiError(errBody)}`);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return await res.json();
    }
    return await res.text();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Notion API request timed out after ${timeoutMs}ms`);
    }
    if (err instanceof TypeError) {
      throw new Error(`Notion API network error: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Plugin class
// ────────────────────────────────────────────────────────────────────────────

export class NotionPlugin extends Plugin {
  readonly id = "notion";
  private ctx?: PluginContext;

  getManifest(): PluginManifest {
    return MANIFEST;
  }

  async onActivate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    const token = asString(ctx.config.integrationToken);
    if (!token) {
      ctx.log("warn", "Notion plugin activated without an integration token — API calls will fail");
    } else {
      ctx.log("info", `Notion plugin activated (default database: ${ctx.config.databaseId ?? "n/a"})`);
    }
  }

  async onDeactivate(): Promise<void> {
    this.ctx?.log("info", "Notion plugin deactivated");
    this.ctx = undefined;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<unknown> {
    this.ctx?.log("debug", `execute(${action})`, params);

    const known = ACTIONS.find((a) => a.name === action);
    if (!known && !EXTRA_ACTIONS.has(action)) {
      throw new Error(`Unknown action: ${action}`);
    }

    const token = asString(this.ctx?.config.integrationToken);
    if (!token) {
      return {
        ok: false,
        action,
        error: "Notion integration token not configured. Set the 'integrationToken' field in plugin config.",
      };
    }

    const baseUrl = (asString(this.ctx?.config.baseUrl) ?? "https://api.notion.com/v1").replace(/\/$/, "");

    try {
      switch (action) {
        case "search":
        case "search-pages": {
          const query = asString(params.query) ?? "";
          const url = `${baseUrl}/search`;
          const body: Record<string, unknown> = { query, page_size: 20 };
          this.ctx?.log("info", `Notion ${action}: POST ${url}`, { query });
          const data = await notionRequest(url, token, {
            method: "POST",
            body: JSON.stringify(body),
          });
          const results = isStringRecord(data) && Array.isArray(data.results) ? data.results : [];
          return { ok: true, action, count: results.length, data: results };
        }

        case "get-page": {
          const pageId = asString(params.pageId);
          if (!pageId) {
            return { ok: false, action, error: "pageId is required" };
          }
          const url = `${baseUrl}/pages/${encodeURIComponent(pageId)}`;
          this.ctx?.log("info", `Notion get-page: GET ${url}`);
          const data = await notionRequest(url, token);
          return { ok: true, action, data };
        }

        case "get-database": {
          const databaseId = asString(params.databaseId) ?? asString(this.ctx?.config.databaseId);
          if (!databaseId) {
            return { ok: false, action, error: "databaseId is required" };
          }
          const url = `${baseUrl}/databases/${encodeURIComponent(databaseId)}`;
          this.ctx?.log("info", `Notion get-database: GET ${url}`);
          const data = await notionRequest(url, token);
          return { ok: true, action, data };
        }

        case "get-databases": {
          // List databases via /search with an object filter
          const url = `${baseUrl}/search`;
          const body = {
            filter: { value: "database", property: "object" },
            page_size: 100,
          };
          this.ctx?.log("info", `Notion get-databases: POST ${url}`);
          const data = await notionRequest(url, token, {
            method: "POST",
            body: JSON.stringify(body),
          });
          const results = isStringRecord(data) && Array.isArray(data.results) ? data.results : [];
          return { ok: true, action, count: results.length, data: results };
        }

        case "query-database": {
          const databaseId = asString(params.databaseId) ?? asString(this.ctx?.config.databaseId);
          if (!databaseId) {
            return { ok: false, action, error: "databaseId is required" };
          }
          const url = `${baseUrl}/databases/${encodeURIComponent(databaseId)}/query`;
          const body: Record<string, unknown> = {};
          if (params.filter !== undefined) {
            const parsed = parseJsonParam(params.filter, "filter");
            if (!parsed.ok) return { ok: false, action, error: parsed.error };
            if (parsed.value !== undefined) body.filter = parsed.value;
          }
          if (params.sorts !== undefined) {
            const parsed = parseJsonParam(params.sorts, "sorts");
            if (!parsed.ok) return { ok: false, action, error: parsed.error };
            if (parsed.value !== undefined) body.sorts = parsed.value;
          }
          this.ctx?.log("info", `Notion query-database: POST ${url}`);
          const data = await notionRequest(url, token, {
            method: "POST",
            body: JSON.stringify(body),
          });
          const results = isStringRecord(data) && Array.isArray(data.results) ? data.results : [];
          return { ok: true, action, count: results.length, data: results };
        }

        case "create-page": {
          const databaseId = asString(params.databaseId) ?? asString(this.ctx?.config.databaseId);
          const title = asString(params.title);
          if (!databaseId) {
            return { ok: false, action, error: "databaseId is required" };
          }
          if (!title) {
            return { ok: false, action, error: "title is required" };
          }
          // Build properties: either from supplied properties JSON or a default title property.
          let properties: unknown;
          if (params.properties !== undefined) {
            const parsed = parseJsonParam(params.properties, "properties");
            if (!parsed.ok) return { ok: false, action, error: parsed.error };
            properties = parsed.value ?? { title: [{ text: { content: title } }] };
          } else {
            properties = { title: [{ text: { content: title } }] };
          }
          const body: Record<string, unknown> = {
            parent: { database_id: databaseId },
            properties,
          };
          if (params.children !== undefined) {
            const parsed = parseJsonParam(params.children, "children");
            if (!parsed.ok) return { ok: false, action, error: parsed.error };
            if (parsed.value !== undefined) body.children = parsed.value;
          }
          const url = `${baseUrl}/pages`;
          this.ctx?.log("info", `Notion create-page: POST ${url}`, { databaseId, title });
          const data = await notionRequest(url, token, {
            method: "POST",
            body: JSON.stringify(body),
          });
          return { ok: true, action, data };
        }

        case "append-blocks": {
          const blockId = asString(params.blockId);
          if (!blockId) {
            return { ok: false, action, error: "blockId is required" };
          }
          const parsed = parseJsonParam(params.blocks, "blocks");
          if (!parsed.ok) return { ok: false, action, error: parsed.error };
          if (parsed.value === undefined || !Array.isArray(parsed.value)) {
            return { ok: false, action, error: "blocks must be a non-empty JSON array" };
          }
          const url = `${baseUrl}/blocks/${encodeURIComponent(blockId)}/children`;
          const body = { children: parsed.value };
          this.ctx?.log("info", `Notion append-blocks: PATCH ${url}`, { blockId, count: parsed.value.length });
          const data = await notionRequest(url, token, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
          const results = isStringRecord(data) && Array.isArray(data.results) ? data.results : [];
          return { ok: true, action, count: results.length, data: results };
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.ctx?.log("error", `Notion ${action} failed: ${msg}`);
      return { ok: false, action, error: msg };
    }
  }
}

export const notionPlugin = new NotionPlugin();
