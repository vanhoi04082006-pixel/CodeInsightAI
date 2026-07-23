// CodeInsight AI — Plugin SDK: GitHub plugin
// Concrete plugin for GitHub integration. Implements real REST API calls
// against https://api.github.com (or a GHES baseUrl) using fetch() with
// 30s timeout, error handling, and proper auth headers.

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

// ────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;

// Actions exposed beyond the manifest's ACTIONS array (still supported by
// execute() but not advertised in the UI catalog).
const EXTRA_ACTIONS = new Set(["create-issue", "get-readme"]);

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function isStringRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Extract a human-readable error message from a GitHub error response body. */
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

/**
 * Perform an authenticated GitHub API request with timeout + error handling.
 * Returns parsed JSON, or raw text for non-JSON responses (e.g. raw README).
 * Throws on non-2xx status, network errors, or timeout.
 */
async function githubRequest(
  url: string,
  headers: Record<string, string>,
  init: { method?: string; body?: string } = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers,
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
      // Friendlier messages for common statuses
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `GitHub authentication failed (${res.status}). Verify the token has the required scopes. Details: ${extractApiError(errBody)}`,
        );
      }
      if (res.status === 404) {
        throw new Error(
          `GitHub resource not found (404) at ${url}. Check owner/repo spelling and token access.`,
        );
      }
      if (res.status === 429 || res.status === 403) {
        throw new Error(
          `GitHub rate limit hit (${res.status}). Wait and retry. Details: ${extractApiError(errBody)}`,
        );
      }
      throw new Error(
        `GitHub API ${res.status} ${res.statusText}: ${extractApiError(errBody)}`,
      );
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return await res.json();
    }
    return await res.text();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`GitHub API request timed out after ${timeoutMs}ms`);
    }
    if (err instanceof TypeError) {
      // fetch() throws TypeError on network failure
      throw new Error(`GitHub API network error: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Plugin class
// ────────────────────────────────────────────────────────────────────────────

export class GitHubPlugin extends Plugin {
  readonly id = "github";
  private ctx?: PluginContext;

  getManifest(): PluginManifest {
    return MANIFEST;
  }

  async onActivate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    const token = asString(ctx.config.token);
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
    this.ctx?.log("debug", `execute(${action})`, params);

    const known = ACTIONS.find((a) => a.name === action);
    if (!known && !EXTRA_ACTIONS.has(action)) {
      throw new Error(`Unknown action: ${action}`);
    }

    const token = asString(this.ctx?.config.token);
    if (!token) {
      return {
        ok: false,
        action,
        error: "GitHub token not configured. Set the 'token' field in plugin config.",
      };
    }

    const baseUrl = asString(this.ctx?.config.baseUrl) ?? "https://api.github.com";
    const headers: Record<string, string> = {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "CodeInsight-AI",
    };

    try {
      switch (action) {
        case "list-repos": {
          const url = `${baseUrl}/user/repos?per_page=100&sort=updated`;
          this.ctx?.log("info", `GitHub list-repos: GET ${url}`);
          const data = await githubRequest(url, headers);
          return { ok: true, action, count: Array.isArray(data) ? data.length : undefined, data };
        }

        case "get-repo": {
          const owner = asString(params.owner) ?? asString(this.ctx?.config.owner);
          const repo = asString(params.repo) ?? asString(this.ctx?.config.repo);
          if (!owner || !repo) {
            return { ok: false, action, error: "owner and repo are required" };
          }
          const url = `${baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
          this.ctx?.log("info", `GitHub get-repo: GET ${url}`);
          const data = await githubRequest(url, headers);
          return { ok: true, action, data };
        }

        case "list-issues": {
          const owner = asString(params.owner) ?? asString(this.ctx?.config.owner);
          const repo = asString(params.repo) ?? asString(this.ctx?.config.repo);
          if (!owner || !repo) {
            return { ok: false, action, error: "owner and repo are required" };
          }
          const state = asString(params.state) ?? "open";
          const url = `${baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=${encodeURIComponent(state)}`;
          this.ctx?.log("info", `GitHub list-issues: GET ${url}`);
          const data = await githubRequest(url, headers);
          return { ok: true, action, count: Array.isArray(data) ? data.length : undefined, data };
        }

        case "create-issue": {
          const owner = asString(params.owner) ?? asString(this.ctx?.config.owner);
          const repo = asString(params.repo) ?? asString(this.ctx?.config.repo);
          const title = asString(params.title);
          if (!owner || !repo || !title) {
            return { ok: false, action, error: "owner, repo, and title are required" };
          }
          const url = `${baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;
          const body: Record<string, unknown> = { title };
          if (typeof params.body === "string") body.body = params.body;
          if (Array.isArray(params.labels)) body.labels = params.labels;
          this.ctx?.log("info", `GitHub create-issue: POST ${url}`, { title });
          const data = await githubRequest(url, headers, {
            method: "POST",
            body: JSON.stringify(body),
          });
          return { ok: true, action, data };
        }

        case "list-prs": {
          const owner = asString(params.owner) ?? asString(this.ctx?.config.owner);
          const repo = asString(params.repo) ?? asString(this.ctx?.config.repo);
          if (!owner || !repo) {
            return { ok: false, action, error: "owner and repo are required" };
          }
          const state = asString(params.state) ?? "open";
          const url = `${baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${encodeURIComponent(state)}`;
          this.ctx?.log("info", `GitHub list-prs: GET ${url}`);
          const data = await githubRequest(url, headers);
          return { ok: true, action, count: Array.isArray(data) ? data.length : undefined, data };
        }

        case "create-pr": {
          const owner = asString(params.owner) ?? asString(this.ctx?.config.owner);
          const repo = asString(params.repo) ?? asString(this.ctx?.config.repo);
          const title = asString(params.title);
          const head = asString(params.head);
          const base = asString(params.base);
          if (!owner || !repo || !title || !head || !base) {
            return { ok: false, action, error: "owner, repo, title, head, and base are required" };
          }
          const url = `${baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`;
          const body: Record<string, unknown> = { title, head, base };
          if (typeof params.body === "string") body.body = params.body;
          this.ctx?.log("info", `GitHub create-pr: POST ${url}`, { title, head, base });
          const data = await githubRequest(url, headers, {
            method: "POST",
            body: JSON.stringify(body),
          });
          return { ok: true, action, data };
        }

        case "get-readme": {
          const owner = asString(params.owner) ?? asString(this.ctx?.config.owner);
          const repo = asString(params.repo) ?? asString(this.ctx?.config.repo);
          if (!owner || !repo) {
            return { ok: false, action, error: "owner and repo are required" };
          }
          const url = `${baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`;
          this.ctx?.log("info", `GitHub get-readme: GET ${url}`);
          const data = await githubRequest(url, {
            ...headers,
            Accept: "application/vnd.github.v3.raw",
          });
          return { ok: true, action, data };
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.ctx?.log("error", `GitHub ${action} failed: ${msg}`);
      return { ok: false, action, error: msg };
    }
  }
}

// Singleton instance
export const githubPlugin = new GitHubPlugin();
