// CodeInsight AI — Plugin SDK: Plugin Manager (Prompt 14)
// Lifecycle management for plugins: register/unregister, config, action
// discovery, and action execution. Also defines the catalog of built-in
// plugin *manifests* (so the UI can advertise supported integrations even
// before a concrete Plugin class is implemented).

import type {
  Plugin,
  PluginManifest,
  PluginAction,
  PluginContext,
  PluginLogLevel,
  PluginEvent,
} from "./types";

// ────────────────────────────────────────────────────────────────────────────
// Built-in manifest catalog — schemas for known integrations.
// These are metadata only (no concrete plugin instances); the actual
// integration code lives in `builtins/`.
// ────────────────────────────────────────────────────────────────────────────

export const BUILTIN_MANIFESTS: Record<string, PluginManifest> = {
  github: {
    id: "github",
    name: "GitHub",
    version: "1.0.0",
    description: "Read repos, issues, and PRs from GitHub; create pull requests.",
    icon: "Github",
    color: "#24292e",
    category: "vcs",
    capabilities: [
      { kind: "read", description: "Read repository metadata, branches, and commits" },
      { kind: "read", description: "Read issues, PRs, comments, and reviews" },
      { kind: "write", description: "Create pull requests, issues, and comments" },
      { kind: "webhook", description: "Subscribe to push, PR, and issue events" },
    ],
    configSchema: {
      token: { type: "string", secret: true, required: true, label: "Personal Access Token", placeholder: "ghp_..." },
      owner: { type: "string", label: "Default owner/org", placeholder: "your-org" },
      repo: { type: "string", label: "Default repo", placeholder: "your-repo" },
      baseUrl: { type: "string", label: "API base URL (for GHES)", default: "https://api.github.com", placeholder: "https://api.github.com" },
    },
    actions: [
      {
        name: "list-repos",
        description: "List repositories for the authenticated user or org.",
        params: { owner: { type: "string", description: "Optional owner/org filter" } },
        result: { type: "array", description: "Repository metadata objects" },
      },
      {
        name: "get-repo",
        description: "Get metadata for a specific repository.",
        params: { owner: { type: "string", required: true }, repo: { type: "string", required: true } },
        result: { type: "object", description: "Repository metadata" },
      },
      {
        name: "list-issues",
        description: "List open issues in a repo.",
        params: { owner: { type: "string", required: true }, repo: { type: "string", required: true }, state: { type: "select", options: ["open", "closed", "all"], default: "open" } },
        result: { type: "array", description: "Issue objects" },
      },
      {
        name: "create-pr",
        description: "Create a new pull request.",
        params: { owner: { type: "string", required: true }, repo: { type: "string", required: true }, title: { type: "string", required: true }, head: { type: "string", required: true }, base: { type: "string", required: true }, body: { type: "string" } },
        result: { type: "object", description: "Created PR metadata" },
      },
    ],
  },

  gitlab: {
    id: "gitlab",
    name: "GitLab",
    version: "1.0.0",
    description: "Read projects, issues, MRs from GitLab; create merge requests.",
    icon: "Gitlab",
    color: "#fc6d26",
    category: "vcs",
    capabilities: [
      { kind: "read", description: "Read project metadata, pipelines, jobs" },
      { kind: "read", description: "Read issues and merge requests" },
      { kind: "write", description: "Create merge requests and issues" },
      { kind: "webhook", description: "Subscribe to push, MR, and pipeline events" },
    ],
    configSchema: {
      token: { type: "string", secret: true, required: true, label: "Personal Access Token" },
      baseUrl: { type: "string", required: true, label: "GitLab base URL", default: "https://gitlab.com", placeholder: "https://gitlab.com" },
      projectId: { type: "string", label: "Default project ID" },
    },
    actions: [
      { name: "list-projects", description: "List projects accessible to the token.", params: {}, result: { type: "array" } },
      { name: "list-mrs", description: "List merge requests for a project.", params: { projectId: { type: "string", required: true } }, result: { type: "array" } },
      { name: "create-mr", description: "Create a new merge request.", params: { projectId: { type: "string", required: true }, title: { type: "string", required: true }, sourceBranch: { type: "string", required: true }, targetBranch: { type: "string", required: true } }, result: { type: "object" } },
    ],
  },

  jira: {
    id: "jira",
    name: "Jira",
    version: "1.0.0",
    description: "Read and create Jira issues; update issue status.",
    icon: "SquareSquare",
    color: "#0052cc",
    category: "issue-tracker",
    capabilities: [
      { kind: "read", description: "Read issues, sprints, and boards" },
      { kind: "write", description: "Create and transition issues" },
      { kind: "search", description: "Search issues via JQL" },
    ],
    configSchema: {
      baseUrl: { type: "string", required: true, label: "Jira base URL", placeholder: "https://your-domain.atlassian.net" },
      email: { type: "string", required: true, label: "Account email" },
      apiToken: { type: "string", secret: true, required: true, label: "API token" },
      projectKey: { type: "string", label: "Default project key" },
    },
    actions: [
      { name: "search-issues", description: "Search issues using JQL.", params: { jql: { type: "string", required: true } }, result: { type: "array" } },
      { name: "get-issue", description: "Get a single issue by key.", params: { key: { type: "string", required: true } }, result: { type: "object" } },
      { name: "create-issue", description: "Create a new issue.", params: { projectKey: { type: "string", required: true }, summary: { type: "string", required: true }, description: { type: "string" }, issueType: { type: "string", default: "Task" } }, result: { type: "object" } },
    ],
  },

  linear: {
    id: "linear",
    name: "Linear",
    version: "1.0.0",
    description: "Read and create Linear issues; manage cycles.",
    icon: "TrendingUp",
    color: "#5e6ad2",
    category: "issue-tracker",
    capabilities: [
      { kind: "read", description: "Read issues, projects, cycles" },
      { kind: "write", description: "Create and update issues" },
      { kind: "search", description: "Search issues via text query" },
    ],
    configSchema: {
      apiKey: { type: "string", secret: true, required: true, label: "Personal API key" },
      teamKey: { type: "string", label: "Default team key" },
    },
    actions: [
      { name: "list-issues", description: "List issues for a team.", params: { teamKey: { type: "string" } }, result: { type: "array" } },
      { name: "create-issue", description: "Create an issue.", params: { teamKey: { type: "string", required: true }, title: { type: "string", required: true }, description: { type: "string" } }, result: { type: "object" } },
    ],
  },

  slack: {
    id: "slack",
    name: "Slack",
    version: "1.0.0",
    description: "Send messages and search Slack channels.",
    icon: "MessageSquare",
    color: "#4a154b",
    category: "chat",
    capabilities: [
      { kind: "write", description: "Send messages to channels or DMs" },
      { kind: "search", description: "Search messages in accessible channels" },
      { kind: "notify", description: "Post notifications (deployments, alerts)" },
    ],
    configSchema: {
      botToken: { type: "string", secret: true, required: true, label: "Bot OAuth Token (xoxb-)" },
      channel: { type: "string", label: "Default channel", placeholder: "#general" },
    },
    actions: [
      { name: "send-message", description: "Send a message to a channel.", params: { channel: { type: "string", required: true }, text: { type: "string", required: true } }, result: { type: "object" } },
      { name: "search-messages", description: "Search messages.", params: { query: { type: "string", required: true } }, result: { type: "array" } },
    ],
  },

  discord: {
    id: "discord",
    name: "Discord",
    version: "1.0.0",
    description: "Send messages to Discord channels via webhooks or bot.",
    icon: "MessageCircle",
    color: "#5865f2",
    category: "chat",
    capabilities: [
      { kind: "write", description: "Send messages via webhook" },
      { kind: "notify", description: "Post deployment/alert notifications" },
    ],
    configSchema: {
      webhookUrl: { type: "string", secret: true, required: true, label: "Webhook URL" },
      botToken: { type: "string", secret: true, label: "Bot token (optional)" },
      defaultChannelId: { type: "string", label: "Default channel ID" },
    },
    actions: [
      { name: "send-message", description: "Send a message via webhook.", params: { text: { type: "string", required: true } }, result: { type: "object" } },
    ],
  },

  figma: {
    id: "figma",
    name: "Figma",
    version: "1.0.0",
    description: "Read Figma file metadata and export designs as images.",
    icon: "Figma",
    color: "#a259ff",
    category: "design",
    capabilities: [
      { kind: "read", description: "Read Figma file metadata, components, styles" },
      { kind: "search", description: "Search components by name" },
    ],
    configSchema: {
      personalAccessToken: { type: "string", secret: true, required: true, label: "Personal access token" },
      fileId: { type: "string", label: "Default file ID" },
    },
    actions: [
      { name: "get-file", description: "Get a Figma file's metadata.", params: { fileId: { type: "string", required: true } }, result: { type: "object" } },
      { name: "export-image", description: "Export a node as PNG/SVG.", params: { fileId: { type: "string", required: true }, nodeId: { type: "string", required: true }, format: { type: "select", options: ["png", "svg", "jpg"], default: "png" } }, result: { type: "object" } },
    ],
  },

  notion: {
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
    actions: [
      { name: "search", description: "Search pages and databases.", params: { query: { type: "string", required: true } }, result: { type: "array" } },
      { name: "get-page", description: "Get a page by ID.", params: { pageId: { type: "string", required: true } }, result: { type: "object" } },
      { name: "create-page", description: "Create a new page in a database.", params: { databaseId: { type: "string", required: true }, title: { type: "string", required: true } }, result: { type: "object" } },
    ],
  },

  supabase: {
    id: "supabase",
    name: "Supabase",
    version: "1.0.0",
    description: "Query Supabase Postgres and manage auth users.",
    icon: "Database",
    color: "#3ecf8e",
    category: "database",
    capabilities: [
      { kind: "read", description: "Read rows from tables via REST" },
      { kind: "write", description: "Insert/update/delete rows" },
      { kind: "search", description: "Run filtered queries" },
    ],
    configSchema: {
      url: { type: "string", required: true, label: "Project URL", placeholder: "https://your-project.supabase.co" },
      anonKey: { type: "string", secret: true, required: true, label: "Anon key" },
      serviceRoleKey: { type: "string", secret: true, label: "Service role key (admin)" },
    },
    actions: [
      { name: "select", description: "Select rows from a table.", params: { table: { type: "string", required: true } }, result: { type: "array" } },
      { name: "insert", description: "Insert a row.", params: { table: { type: "string", required: true }, row: { type: "string", required: true } }, result: { type: "object" } },
    ],
  },

  firebase: {
    id: "firebase",
    name: "Firebase",
    version: "1.0.0",
    description: "Read/write Firestore documents and manage auth users.",
    icon: "Flame",
    color: "#ffca28",
    category: "database",
    capabilities: [
      { kind: "read", description: "Read Firestore documents" },
      { kind: "write", description: "Write Firestore documents" },
    ],
    configSchema: {
      projectId: { type: "string", required: true, label: "Project ID" },
      serviceAccountJson: { type: "string", secret: true, required: true, label: "Service account JSON" },
    },
    actions: [
      { name: "get-doc", description: "Get a document by path.", params: { path: { type: "string", required: true } }, result: { type: "object" } },
      { name: "set-doc", description: "Set a document by path.", params: { path: { type: "string", required: true }, data: { type: "string", required: true } }, result: { type: "object" } },
    ],
  },

  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    version: "1.0.0",
    description: "Route AI requests to OpenRouter's many providers.",
    icon: "Router",
    color: "#6366f1",
    category: "ai-provider",
    capabilities: [
      { kind: "write", description: "Send chat completion requests" },
      { kind: "read", description: "List available models" },
    ],
    configSchema: {
      apiKey: { type: "string", secret: true, required: true, label: "OpenRouter API key" },
      defaultModel: { type: "string", default: "anthropic/claude-3.5-sonnet" },
      baseUrl: { type: "string", default: "https://openrouter.ai/api/v1" },
    },
    actions: [
      { name: "list-models", description: "List available models.", params: {}, result: { type: "array" } },
      { name: "chat", description: "Send a chat completion request.", params: { model: { type: "string" }, messages: { type: "string" } }, result: { type: "object" } },
    ],
  },

  ollama: {
    id: "ollama",
    name: "Ollama",
    version: "1.0.0",
    description: "Run local LLMs via the Ollama HTTP API.",
    icon: "Cpu",
    color: "#000000",
    category: "ai-provider",
    capabilities: [
      { kind: "write", description: "Send chat completion requests to local models" },
      { kind: "read", description: "List locally available models" },
    ],
    configSchema: {
      baseUrl: { type: "string", default: "http://localhost:11434", label: "Ollama base URL" },
      defaultModel: { type: "string", default: "llama3.1:8b" },
    },
    actions: [
      { name: "list-models", description: "List locally available models.", params: {}, result: { type: "array" } },
      { name: "chat", description: "Send a chat completion request.", params: { model: { type: "string" }, messages: { type: "string" } }, result: { type: "object" } },
    ],
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Registered plugin record (internal)
// ────────────────────────────────────────────────────────────────────────────

interface RegisteredPlugin {
  plugin: Plugin;
  config: Record<string, unknown>;
  ctx?: PluginContext;
  active: boolean;
  registeredAt: number;
  lastUsedAt?: number;
  invocationCount: number;
}

// ────────────────────────────────────────────────────────────────────────────
// PluginManager
// ────────────────────────────────────────────────────────────────────────────

export class PluginManager {
  private plugins = new Map<string, RegisteredPlugin>();
  private eventListeners = new Map<string, Set<(evt: PluginEvent) => void>>();
  private logBuffer: Array<{ level: PluginLogLevel; pluginId: string; message: string; details?: unknown; timestamp: number }> = [];

  /** Register and activate a plugin. */
  async register(plugin: Plugin, config: Record<string, unknown> = {}): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin "${plugin.id}" is already registered`);
    }

    const manifest = plugin.getManifest();
    const mergedConfig = this.applyDefaults(manifest, config);

    const record: RegisteredPlugin = {
      plugin,
      config: mergedConfig,
      active: false,
      registeredAt: Date.now(),
      invocationCount: 0,
    };

    // Build the context
    const ctx: PluginContext = {
      config: mergedConfig,
      log: (level, message, details) => this.handleLog(plugin.id, level, message, details),
      emit: (event, data) => this.handleEmit(plugin.id, event, data),
    };
    record.ctx = ctx;

    this.plugins.set(plugin.id, record);

    try {
      await plugin.onActivate(ctx);
      record.active = true;
      this.handleLog(plugin.id, "info", `Plugin "${manifest.name}" v${manifest.version} activated`);
    } catch (err) {
      this.plugins.delete(plugin.id);
      const msg = err instanceof Error ? err.message : String(err);
      this.handleLog(plugin.id, "error", `Activation failed: ${msg}`);
      throw err;
    }
  }

  /** Deactivate and remove a plugin. */
  async unregister(pluginId: string): Promise<void> {
    const record = this.plugins.get(pluginId);
    if (!record) return;
    try {
      if (record.active) {
        await record.plugin.onDeactivate();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.handleLog(pluginId, "warn", `onDeactivate error: ${msg}`);
    } finally {
      this.plugins.delete(pluginId);
    }
  }

  /** Get the registered Plugin instance (or null). */
  get(pluginId: string): Plugin | null {
    return this.plugins.get(pluginId)?.plugin ?? null;
  }

  /** List manifests of all registered plugins. */
  list(): PluginManifest[] {
    return Array.from(this.plugins.values()).map((r) => r.plugin.getManifest());
  }

  /** List manifests filtered by category. */
  listByCategory(category: PluginManifest["category"]): PluginManifest[] {
    return this.list().filter((m) => m.category === category);
  }

  /** Execute an action on a registered plugin. */
  async execute(pluginId: string, action: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const record = this.plugins.get(pluginId);
    if (!record) {
      throw new Error(`Plugin "${pluginId}" is not registered`);
    }
    if (!record.active) {
      throw new Error(`Plugin "${pluginId}" is not active`);
    }
    const startedAt = Date.now();
    record.invocationCount += 1;
    record.lastUsedAt = startedAt;
    try {
      const result = await record.plugin.execute(action, params);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.handleLog(pluginId, "error", `Action "${action}" failed: ${msg}`);
      throw err;
    }
  }

  /** Get the actions a plugin exposes (from its manifest). */
  getActions(pluginId: string): PluginAction[] {
    const record = this.plugins.get(pluginId);
    if (!record) return [];
    return record.plugin.getManifest().actions ?? [];
  }

  /** Update a plugin's config at runtime (re-activates the plugin). */
  async setConfig(pluginId: string, config: Record<string, unknown>): Promise<void> {
    const record = this.plugins.get(pluginId);
    if (!record) throw new Error(`Plugin "${pluginId}" is not registered`);
    const merged = this.applyDefaults(record.plugin.getManifest(), config);
    record.config = merged;
    if (record.ctx) {
      record.ctx.config = merged;
    }
    // Re-activate so the plugin picks up new config.
    try {
      await record.plugin.onDeactivate();
    } catch {
      // ignore
    }
    if (record.ctx) {
      await record.plugin.onActivate(record.ctx);
    }
    this.handleLog(pluginId, "info", "Configuration updated");
  }

  /** Get a plugin's current config (secrets masked). */
  getConfig(pluginId: string): Record<string, unknown> {
    const record = this.plugins.get(pluginId);
    if (!record) return {};
    const manifest = record.plugin.getManifest();
    const schema = manifest.configSchema ?? {};
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record.config)) {
      const field = schema[key];
      if (field?.secret && typeof value === "string" && value.length > 0) {
        masked[key] = "•".repeat(Math.min(20, value.length));
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

  /** Get raw config including secrets (use sparingly — for internal use only). */
  getRawConfig(pluginId: string): Record<string, unknown> {
    return this.plugins.get(pluginId)?.config ?? {};
  }

  // ── Catalog & events ────────────────────────────────────────────────

  /** Get the manifest for a built-in plugin (without registering it). */
  getBuiltinManifest(id: string): PluginManifest | null {
    return BUILTIN_MANIFESTS[id] ?? null;
  }

  /** List all known built-in manifests. */
  listBuiltins(): PluginManifest[] {
    return Object.values(BUILTIN_MANIFESTS);
  }

  /** Subscribe to plugin events. Returns an unsubscribe function. */
  on(event: string, handler: (evt: PluginEvent) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
    return () => {
      this.eventListeners.get(event)?.delete(handler);
    };
  }

  /** Get recent log entries (for the developer panel). */
  getLogs(limit: number = 100): Array<{ level: PluginLogLevel; pluginId: string; message: string; details?: unknown; timestamp: number }> {
    return this.logBuffer.slice(-limit);
  }

  /** Stats for a plugin (invocations, last-used). */
  getStats(pluginId: string): {
    registeredAt: number;
    lastUsedAt?: number;
    invocationCount: number;
    active: boolean;
  } | null {
    const record = this.plugins.get(pluginId);
    if (!record) return null;
    return {
      registeredAt: record.registeredAt,
      lastUsedAt: record.lastUsedAt,
      invocationCount: record.invocationCount,
      active: record.active,
    };
  }

  // ── Internals ────────────────────────────────────────────────────────

  private applyDefaults(manifest: PluginManifest, config: Record<string, unknown>): Record<string, unknown> {
    const schema = manifest.configSchema ?? {};
    const merged: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(schema)) {
      if (field.default !== undefined) {
        merged[key] = field.default;
      }
    }
    Object.assign(merged, config);
    return merged;
  }

  private handleLog(pluginId: string, level: PluginLogLevel, message: string, details?: unknown): void {
    const entry = { level, pluginId, message, details, timestamp: Date.now() };
    this.logBuffer.push(entry);
    // Cap log buffer to 1000 entries
    if (this.logBuffer.length > 1000) {
      this.logBuffer.splice(0, this.logBuffer.length - 1000);
    }
  }

  private handleEmit(pluginId: string, event: string, data: unknown): void {
    const evt: PluginEvent = { type: event, data, timestamp: Date.now(), pluginId };
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const l of listeners) {
        try {
          l(evt);
        } catch {
          // ignore listener errors
        }
      }
    }
    // Wildcard listeners
    const wildcard = this.eventListeners.get("*");
    if (wildcard) {
      for (const l of wildcard) {
        try {
          l(evt);
        } catch {
          // ignore
        }
      }
    }
  }
}

// Singleton
export const pluginManager = new PluginManager();
