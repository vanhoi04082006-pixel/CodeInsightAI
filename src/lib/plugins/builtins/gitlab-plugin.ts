// CodeInsight AI — Plugin SDK: GitLab stub plugin
// Concrete plugin for GitLab integration. Manifest + actions complete;
// HTTP calls are stubbed.

import {
  Plugin,
  type PluginContext,
  type PluginManifest,
  type PluginAction,
} from "../types";

const ACTIONS: PluginAction[] = [
  {
    name: "list-projects",
    description: "List projects accessible to the token.",
    params: {},
    result: { type: "array", description: "Project metadata objects" },
  },
  {
    name: "get-project",
    description: "Get a single project by ID.",
    params: { projectId: { type: "string", required: true } },
    result: { type: "object", description: "Project metadata" },
  },
  {
    name: "list-mrs",
    description: "List merge requests for a project.",
    params: { projectId: { type: "string", required: true }, state: { type: "select", options: ["opened", "closed", "all"], default: "opened" } },
    result: { type: "array", description: "MR objects" },
  },
  {
    name: "create-mr",
    description: "Create a new merge request.",
    params: {
      projectId: { type: "string", required: true },
      title: { type: "string", required: true },
      sourceBranch: { type: "string", required: true },
      targetBranch: { type: "string", required: true },
      description: { type: "string" },
    },
    result: { type: "object", description: "Created MR metadata" },
  },
  {
    name: "list-pipelines",
    description: "List CI/CD pipelines for a project.",
    params: { projectId: { type: "string", required: true } },
    result: { type: "array", description: "Pipeline objects" },
  },
];

const MANIFEST: PluginManifest = {
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
  actions: ACTIONS,
};

const NOT_IMPLEMENTED =
  "not yet implemented — configure API credentials and implement in builtins/gitlab-plugin.ts";

export class GitLabPlugin extends Plugin {
  readonly id = "gitlab";
  private ctx?: PluginContext;

  getManifest(): PluginManifest {
    return MANIFEST;
  }

  async onActivate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    const token = ctx.config.token as string | undefined;
    if (!token) {
      ctx.log("warn", "GitLab plugin activated without a token — API calls will fail");
    } else {
      ctx.log("info", `GitLab plugin activated (baseUrl=${ctx.config.baseUrl ?? "https://gitlab.com"})`);
    }
  }

  async onDeactivate(): Promise<void> {
    this.ctx?.log("info", "GitLab plugin deactivated");
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
      hint: "Fill in builtins/gitlab-plugin.ts:execute() with fetch() calls to ${baseUrl}/api/v4/...",
    };
  }
}

export const gitlabPlugin = new GitLabPlugin();
