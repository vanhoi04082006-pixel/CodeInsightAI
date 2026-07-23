// CodeInsight AI — Plugin SDK: GitLab plugin
// Concrete plugin for GitLab integration. Implements real REST API calls
// against ${baseUrl}/api/v4/* using fetch() with 30s timeout, error
// handling, and PRIVATE-TOKEN auth.

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

// ────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;

// Actions exposed beyond the manifest's ACTIONS array (still supported by
// execute() but not advertised in the UI catalog).
const EXTRA_ACTIONS = new Set(["list-issues", "create-issue"]);

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

/**
 * Resolve a GitLab project identifier. Accepts either:
 *  - A numeric ID (e.g. "12345") — used as-is in the URL path.
 *  - A URL-encoded path (e.g. "group%2Fproject") — used as-is.
 *  - An unencoded "owner/repo" pair — URL-encoded via encodeURIComponent.
 */
function resolveProjectId(params: Record<string, unknown>, config: Record<string, unknown>): string | undefined {
  const explicit = asString(params.projectId) ?? asString(config.projectId);
  if (explicit) {
    // If it looks like "owner/repo" and isn't already encoded, encode it.
    if (explicit.includes("/") && !explicit.includes("%2F")) {
      return encodeURIComponent(explicit);
    }
    return explicit;
  }
  const owner = asString(params.owner);
  const repo = asString(params.repo);
  if (owner && repo) {
    return encodeURIComponent(`${owner}/${repo}`);
  }
  return undefined;
}

async function gitlabRequest(
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
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `GitLab authentication failed (${res.status}). Verify your PRIVATE-TOKEN. Details: ${extractApiError(errBody)}`,
        );
      }
      if (res.status === 404) {
        throw new Error(
          `GitLab resource not found (404) at ${url}. Check projectId / path and token access.`,
        );
      }
      if (res.status === 429) {
        throw new Error(
          `GitLab rate limit hit (429). Wait and retry. Details: ${extractApiError(errBody)}`,
        );
      }
      throw new Error(`GitLab API ${res.status} ${res.statusText}: ${extractApiError(errBody)}`);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return await res.json();
    }
    return await res.text();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`GitLab API request timed out after ${timeoutMs}ms`);
    }
    if (err instanceof TypeError) {
      throw new Error(`GitLab API network error: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Plugin class
// ────────────────────────────────────────────────────────────────────────────

export class GitLabPlugin extends Plugin {
  readonly id = "gitlab";
  private ctx?: PluginContext;

  getManifest(): PluginManifest {
    return MANIFEST;
  }

  async onActivate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    const token = asString(ctx.config.token);
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
        error: "GitLab token not configured. Set the 'token' field in plugin config.",
      };
    }

    const baseUrl = (asString(this.ctx?.config.baseUrl) ?? "https://gitlab.com").replace(/\/$/, "");
    const headers: Record<string, string> = {
      "PRIVATE-TOKEN": token,
      Accept: "application/json",
    };

    try {
      switch (action) {
        case "list-projects": {
          const url = `${baseUrl}/api/v4/projects?membership=true&per_page=100`;
          this.ctx?.log("info", `GitLab list-projects: GET ${url}`);
          const data = await gitlabRequest(url, headers);
          return { ok: true, action, count: Array.isArray(data) ? data.length : undefined, data };
        }

        case "get-project": {
          const projectId = resolveProjectId(params, this.ctx?.config ?? {});
          if (!projectId) {
            return { ok: false, action, error: "projectId (or owner+repo) is required" };
          }
          const url = `${baseUrl}/api/v4/projects/${projectId}`;
          this.ctx?.log("info", `GitLab get-project: GET ${url}`);
          const data = await gitlabRequest(url, headers);
          return { ok: true, action, data };
        }

        case "list-issues": {
          const projectId = resolveProjectId(params, this.ctx?.config ?? {});
          if (!projectId) {
            return { ok: false, action, error: "projectId (or owner+repo) is required" };
          }
          const state = asString(params.state) ?? "opened";
          const url = `${baseUrl}/api/v4/projects/${projectId}/issues?state=${encodeURIComponent(state)}`;
          this.ctx?.log("info", `GitLab list-issues: GET ${url}`);
          const data = await gitlabRequest(url, headers);
          return { ok: true, action, count: Array.isArray(data) ? data.length : undefined, data };
        }

        case "create-issue": {
          const projectId = resolveProjectId(params, this.ctx?.config ?? {});
          const title = asString(params.title);
          if (!projectId || !title) {
            return { ok: false, action, error: "projectId (or owner+repo) and title are required" };
          }
          const url = `${baseUrl}/api/v4/projects/${projectId}/issues`;
          const body: Record<string, unknown> = { title };
          if (typeof params.description === "string") body.description = params.description;
          if (Array.isArray(params.labels)) {
            body.labels = params.labels.filter((l) => typeof l === "string").join(",");
          }
          this.ctx?.log("info", `GitLab create-issue: POST ${url}`, { title });
          const data = await gitlabRequest(url, headers, {
            method: "POST",
            body: JSON.stringify(body),
          });
          return { ok: true, action, data };
        }

        case "list-mrs": {
          const projectId = resolveProjectId(params, this.ctx?.config ?? {});
          if (!projectId) {
            return { ok: false, action, error: "projectId (or owner+repo) is required" };
          }
          const state = asString(params.state) ?? "opened";
          const url = `${baseUrl}/api/v4/projects/${projectId}/merge_requests?state=${encodeURIComponent(state)}`;
          this.ctx?.log("info", `GitLab list-mrs: GET ${url}`);
          const data = await gitlabRequest(url, headers);
          return { ok: true, action, count: Array.isArray(data) ? data.length : undefined, data };
        }

        case "create-mr": {
          const projectId = resolveProjectId(params, this.ctx?.config ?? {});
          const title = asString(params.title);
          const sourceBranch = asString(params.sourceBranch) ?? asString(params.source_branch);
          const targetBranch = asString(params.targetBranch) ?? asString(params.target_branch);
          if (!projectId || !title || !sourceBranch || !targetBranch) {
            return { ok: false, action, error: "projectId, title, sourceBranch, and targetBranch are required" };
          }
          const url = `${baseUrl}/api/v4/projects/${projectId}/merge_requests`;
          const body: Record<string, unknown> = {
            title,
            source_branch: sourceBranch,
            target_branch: targetBranch,
          };
          if (typeof params.description === "string") body.description = params.description;
          this.ctx?.log("info", `GitLab create-mr: POST ${url}`, { title, source_branch: sourceBranch, target_branch: targetBranch });
          const data = await gitlabRequest(url, headers, {
            method: "POST",
            body: JSON.stringify(body),
          });
          return { ok: true, action, data };
        }

        case "list-pipelines": {
          const projectId = resolveProjectId(params, this.ctx?.config ?? {});
          if (!projectId) {
            return { ok: false, action, error: "projectId (or owner+repo) is required" };
          }
          const url = `${baseUrl}/api/v4/projects/${projectId}/pipelines?per_page=50`;
          this.ctx?.log("info", `GitLab list-pipelines: GET ${url}`);
          const data = await gitlabRequest(url, headers);
          return { ok: true, action, count: Array.isArray(data) ? data.length : undefined, data };
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.ctx?.log("error", `GitLab ${action} failed: ${msg}`);
      return { ok: false, action, error: msg };
    }
  }
}

export const gitlabPlugin = new GitLabPlugin();
