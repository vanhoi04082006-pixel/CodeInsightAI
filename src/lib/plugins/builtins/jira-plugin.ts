// CodeInsight AI — Plugin SDK: Jira stub plugin
// Concrete plugin for Jira integration. Manifest + actions complete;
// API calls are stubbed.

import {
  Plugin,
  type PluginContext,
  type PluginManifest,
  type PluginAction,
} from "../types";

const ACTIONS: PluginAction[] = [
  {
    name: "search-issues",
    description: "Search issues using JQL.",
    params: { jql: { type: "string", required: true, label: "JQL query" } },
    result: { type: "array", description: "Matching issues" },
  },
  {
    name: "get-issue",
    description: "Get a single issue by key.",
    params: { key: { type: "string", required: true, placeholder: "PROJ-123" } },
    result: { type: "object", description: "Issue metadata" },
  },
  {
    name: "create-issue",
    description: "Create a new issue.",
    params: {
      projectKey: { type: "string", required: true },
      summary: { type: "string", required: true },
      description: { type: "string" },
      issueType: { type: "string", default: "Task" },
    },
    result: { type: "object", description: "Created issue metadata" },
  },
  {
    name: "transition-issue",
    description: "Transition an issue to a new status.",
    params: {
      key: { type: "string", required: true },
      transitionId: { type: "string", required: true },
    },
    result: { type: "object", description: "Transition result" },
  },
  {
    name: "add-comment",
    description: "Add a comment to an issue.",
    params: {
      key: { type: "string", required: true },
      body: { type: "string", required: true },
    },
    result: { type: "object", description: "Comment metadata" },
  },
];

const MANIFEST: PluginManifest = {
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
  actions: ACTIONS,
};

const NOT_IMPLEMENTED =
  "not yet implemented — configure API credentials and implement in builtins/jira-plugin.ts";

export class JiraPlugin extends Plugin {
  readonly id = "jira";
  private ctx?: PluginContext;

  getManifest(): PluginManifest {
    return MANIFEST;
  }

  async onActivate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    const token = ctx.config.apiToken as string | undefined;
    const email = ctx.config.email as string | undefined;
    if (!token || !email) {
      ctx.log("warn", "Jira plugin activated without email+apiToken — API calls will fail");
    } else {
      ctx.log("info", `Jira plugin activated (baseUrl=${ctx.config.baseUrl ?? "n/a"})`);
    }
  }

  async onDeactivate(): Promise<void> {
    this.ctx?.log("info", "Jira plugin deactivated");
    this.ctx = undefined;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<unknown> {
    const known = ACTIONS.find((a) => a.name === action);
    if (!known) throw new Error(`Unknown action: ${action}`);
    this.ctx?.log("debug", `execute(${action})`, params);

    // `search-issues` scaffold: validate JQL is non-empty
    if (action === "search-issues") {
      const jql = params.jql as string;
      if (!jql || !jql.trim()) {
        return {
          ok: false,
          implemented: false,
          action,
          params,
          message: "JQL query is required",
        };
      }
    }

    return {
      ok: false,
      implemented: false,
      action,
      params,
      message: NOT_IMPLEMENTED,
      hint: "Fill in builtins/jira-plugin.ts:execute() with fetch() calls to ${baseUrl}/rest/api/3/... (Basic auth: base64(email:apiToken))",
    };
  }
}

export const jiraPlugin = new JiraPlugin();
