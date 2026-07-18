// CodeInsight AI — Plugin SDK: GitHub stub plugin
// Concrete plugin for GitHub integration. The manifest, capabilities, and
// action surface are complete; the actual API calls are stubbed for now.
// Implement the real HTTP calls inside `execute()` once credentials + the
// GitHub REST/GraphQL endpoints are wired up.

import {
  Plugin,
  type PluginContext,
  type PluginManifest,
  type PluginAction,
} from "../types";

const ACTIONS: PluginAction[] = [
  {
    name: "list-repos",
    description: "List repositories for the authenticated user or org.",
    params: { owner: { type: "string", description: "Optional owner/org filter" } },
    result: { type: "array", description: "Repository metadata objects" },
  },
  {
    name: "get-repo",
    description: "Get metadata for a specific repository.",
    params: {
      owner: { type: "string", required: true },
      repo: { type: "string", required: true },
    },
    result: { type: "object", description: "Repository metadata" },
  },
  {
    name: "list-issues",
    description: "List open issues in a repo.",
    params: {
      owner: { type: "string", required: true },
      repo: { type: "string", required: true },
      state: { type: "select", options: ["open", "closed", "all"], default: "open" },
    },
    result: { type: "array", description: "Issue objects" },
  },
  {
    name: "list-prs",
    description: "List pull requests in a repo.",
    params: {
      owner: { type: "string", required: true },
      repo: { type: "string", required: true },
      state: { type: "select", options: ["open", "closed", "all"], default: "open" },
    },
    result: { type: "array", description: "PR objects" },
  },
  {
    name: "create-pr",
    description: "Create a new pull request.",
    params: {
      owner: { type: "string", required: true },
      repo: { type: "string", required: true },
      title: { type: "string", required: true },
      head: { type: "string", required: true },
      base: { type: "string", required: true },
      body: { type: "string" },
    },
    result: { type: "object", description: "Created PR metadata" },
  },
];

const MANIFEST: PluginManifest = {
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
  actions: ACTIONS,
};

const NOT_IMPLEMENTED =
  "not yet implemented — configure API credentials and implement in builtins/github-plugin.ts";

export class GitHubPlugin extends Plugin {
  readonly id = "github";
  private ctx?: PluginContext;

  getManifest(): PluginManifest {
    return MANIFEST;
  }

  async onActivate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    const token = ctx.config.token as string | undefined;
    if (!token) {
      ctx.log("warn", "GitHub plugin activated without a token — API calls will fail");
    } else {
      ctx.log("info", `GitHub plugin activated (owner=${ctx.config.owner ?? "n/a"})`);
    }
  }

  async onDeactivate(): Promise<void> {
    this.ctx?.log("info", "GitHub plugin deactivated");
    this.ctx = undefined;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<unknown> {
    // Validate the action is one we expose
    const known = ACTIONS.find((a) => a.name === action);
    if (!known) {
      throw new Error(`Unknown action: ${action}`);
    }

    this.ctx?.log("debug", `execute(${action})`, params);

    // TODO: implement real HTTP calls to the GitHub API. For now, return a
    // structured "not yet implemented" result so callers can detect this case
    // and surface an actionable message.
    return {
      ok: false,
      implemented: false,
      action,
      params,
      message: NOT_IMPLEMENTED,
      hint: "Fill in builtins/github-plugin.ts:execute() with fetch() calls to https://api.github.com",
    };
  }
}

// Singleton instance
export const githubPlugin = new GitHubPlugin();
