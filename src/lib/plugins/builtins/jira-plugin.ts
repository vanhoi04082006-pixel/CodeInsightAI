// CodeInsight AI — Plugin SDK: Jira plugin
// Concrete plugin for Jira integration. Implements real REST API calls
// against ${baseUrl}/rest/api/3/* using fetch() with 30s timeout, error
// handling, and Basic auth (base64(email:apiToken)).

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

// ────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;

// Actions exposed beyond the manifest's ACTIONS array (still supported by
// execute() but not advertised in the UI catalog).
const EXTRA_ACTIONS = new Set(["list-projects"]);

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function isStringRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extractApiError(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 500);
  if (isStringRecord(body)) {
    // Jira error shape: { errorMessages: [...], errors: { field: msg } }
    if (Array.isArray(body.errorMessages) && body.errorMessages.length > 0) {
      return body.errorMessages.filter((m) => typeof m === "string").join("; ").slice(0, 500);
    }
    if (isStringRecord(body.errors)) {
      const fields = Object.entries(body.errors)
        .filter(([, v]) => typeof v === "string")
        .map(([k, v]) => `${k}: ${v}`);
      if (fields.length > 0) return fields.join("; ").slice(0, 500);
    }
    if (typeof body.message === "string") return body.message;
  }
  try {
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return String(body).slice(0, 500);
  }
}

/** Base64-encode "email:apiToken" for HTTP Basic auth. */
function basicAuthHeader(email: string, apiToken: string): string {
  const credentials = `${email}:${apiToken}`;
  // Buffer is globally available in Node.js (Next.js server runtime).
  return `Basic ${Buffer.from(credentials, "utf-8").toString("base64")}`;
}

/**
 * Convert a description/comment value into Atlassian Document Format (ADF).
 * - Strings that parse as JSON objects are passed through (already ADF).
 * - Other strings are wrapped as a single-paragraph ADF doc.
 * - Objects/arrays are passed through as-is.
 */
function toAdf(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    // Try parsing as JSON first (could be pre-built ADF)
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed;
        }
      } catch {
        // Not valid JSON — fall through and wrap as text
      }
    }
    return {
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: value }] },
      ],
    };
  }
  return value;
}

async function jiraRequest(
  url: string,
  authHeader: string,
  init: { method?: string; body?: string } = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
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
          `Jira authentication failed (${res.status}). Verify email + API token. Details: ${extractApiError(errBody)}`,
        );
      }
      if (res.status === 404) {
        throw new Error(
          `Jira resource not found (404) at ${url}. Check the issue key / endpoint.`,
        );
      }
      if (res.status === 429) {
        throw new Error(
          `Jira rate limit hit (429). Wait and retry. Details: ${extractApiError(errBody)}`,
        );
      }
      throw new Error(`Jira API ${res.status} ${res.statusText}: ${extractApiError(errBody)}`);
    }
    // 204 No Content (e.g. transition-issue on some instances)
    if (res.status === 204) {
      return { ok: true, status: 204 };
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return await res.json();
    }
    return await res.text();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Jira API request timed out after ${timeoutMs}ms`);
    }
    if (err instanceof TypeError) {
      throw new Error(`Jira API network error: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Plugin class
// ────────────────────────────────────────────────────────────────────────────

export class JiraPlugin extends Plugin {
  readonly id = "jira";
  private ctx?: PluginContext;

  getManifest(): PluginManifest {
    return MANIFEST;
  }

  async onActivate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    const token = asString(ctx.config.apiToken);
    const email = asString(ctx.config.email);
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
    this.ctx?.log("debug", `execute(${action})`, params);

    const known = ACTIONS.find((a) => a.name === action);
    if (!known && !EXTRA_ACTIONS.has(action)) {
      throw new Error(`Unknown action: ${action}`);
    }

    const apiToken = asString(this.ctx?.config.apiToken);
    if (!apiToken) {
      return {
        ok: false,
        action,
        error: "Jira API token not configured. Set the 'apiToken' field in plugin config.",
      };
    }
    const email = asString(this.ctx?.config.email);
    if (!email) {
      return {
        ok: false,
        action,
        error: "Jira account email not configured. Set the 'email' field in plugin config.",
      };
    }
    const baseUrl = (asString(this.ctx?.config.baseUrl) ?? "").replace(/\/$/, "");
    if (!baseUrl) {
      return {
        ok: false,
        action,
        error: "Jira baseUrl not configured. Set the 'baseUrl' field in plugin config.",
      };
    }

    const authHeader = basicAuthHeader(email, apiToken);

    try {
      switch (action) {
        case "search-issues": {
          const jql = asString(params.jql);
          if (!jql || !jql.trim()) {
            return { ok: false, action, error: "jql is required" };
          }
          const maxResults = typeof params.maxResults === "number"
            ? params.maxResults
            : typeof params.maxResults === "string" && /^\d+$/.test(params.maxResults)
              ? parseInt(params.maxResults, 10)
              : 50;
          const url = `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}`;
          this.ctx?.log("info", `Jira search-issues: GET ${url}`);
          const data = await jiraRequest(url, authHeader);
          const issues = isStringRecord(data) && Array.isArray(data.issues) ? data.issues : [];
          return {
            ok: true,
            action,
            count: issues.length,
            total: isStringRecord(data) && typeof data.total === "number" ? data.total : issues.length,
            data: issues,
          };
        }

        case "get-issue": {
          const issueKey = asString(params.key) ?? asString(params.issueKey);
          if (!issueKey) {
            return { ok: false, action, error: "key (issue key, e.g. PROJ-123) is required" };
          }
          const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`;
          this.ctx?.log("info", `Jira get-issue: GET ${url}`);
          const data = await jiraRequest(url, authHeader);
          return { ok: true, action, data };
        }

        case "create-issue": {
          const projectKey = asString(params.projectKey) ?? asString(this.ctx?.config.projectKey);
          const summary = asString(params.summary);
          if (!projectKey || !summary) {
            return { ok: false, action, error: "projectKey and summary are required" };
          }
          const issueType = asString(params.issueType) ?? "Task";
          const fields: Record<string, unknown> = {
            project: { key: projectKey },
            summary,
            issuetype: { name: issueType },
          };
          const descriptionAdf = toAdf(params.description);
          if (descriptionAdf !== undefined) {
            fields.description = descriptionAdf;
          }
          const url = `${baseUrl}/rest/api/3/issue`;
          this.ctx?.log("info", `Jira create-issue: POST ${url}`, { projectKey, summary, issueType });
          const data = await jiraRequest(url, authHeader, {
            method: "POST",
            body: JSON.stringify({ fields }),
          });
          return { ok: true, action, data };
        }

        case "list-projects": {
          const url = `${baseUrl}/rest/api/3/project`;
          this.ctx?.log("info", `Jira list-projects: GET ${url}`);
          const data = await jiraRequest(url, authHeader);
          return { ok: true, action, count: Array.isArray(data) ? data.length : undefined, data };
        }

        case "transition-issue": {
          const issueKey = asString(params.key) ?? asString(params.issueKey);
          const transitionId = asString(params.transitionId);
          if (!issueKey || !transitionId) {
            return { ok: false, action, error: "key and transitionId are required" };
          }
          const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`;
          const body = { transition: { id: transitionId } };
          this.ctx?.log("info", `Jira transition-issue: POST ${url}`, { issueKey, transitionId });
          const data = await jiraRequest(url, authHeader, {
            method: "POST",
            body: JSON.stringify(body),
          });
          return { ok: true, action, data };
        }

        case "add-comment": {
          const issueKey = asString(params.key) ?? asString(params.issueKey);
          const bodyText = asString(params.body);
          if (!issueKey || !bodyText) {
            return { ok: false, action, error: "key and body are required" };
          }
          const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`;
          const body = { body: toAdf(bodyText) };
          this.ctx?.log("info", `Jira add-comment: POST ${url}`, { issueKey });
          const data = await jiraRequest(url, authHeader, {
            method: "POST",
            body: JSON.stringify(body),
          });
          return { ok: true, action, data };
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.ctx?.log("error", `Jira ${action} failed: ${msg}`);
      return { ok: false, action, error: msg };
    }
  }
}

export const jiraPlugin = new JiraPlugin();
