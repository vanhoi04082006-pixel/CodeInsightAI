// CodeInsight AI — Plugin SDK: Notion stub plugin
// Concrete plugin for Notion integration. Manifest + actions complete;
// API calls are stubbed.

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

const NOT_IMPLEMENTED =
  "not yet implemented — configure API credentials and implement in builtins/notion-plugin.ts";

export class NotionPlugin extends Plugin {
  readonly id = "notion";
  private ctx?: PluginContext;

  getManifest(): PluginManifest {
    return MANIFEST;
  }

  async onActivate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    const token = ctx.config.integrationToken as string | undefined;
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
    const known = ACTIONS.find((a) => a.name === action);
    if (!known) throw new Error(`Unknown action: ${action}`);
    this.ctx?.log("debug", `execute(${action})`, params);
    return {
      ok: false,
      implemented: false,
      action,
      params,
      message: NOT_IMPLEMENTED,
      hint: "Fill in builtins/notion-plugin.ts:execute() with fetch() calls to https://api.notion.com/v1/... (Authorization: Bearer ${integrationToken}, Notion-Version: 2022-06-28)",
    };
  }
}

export const notionPlugin = new NotionPlugin();
