// CodeInsight AI — Plugin SDK: Slack plugin
// Concrete plugin for Slack integration. Implements real REST API calls
// against https://slack.com/api/* using fetch() with 30s timeout, error
// handling, and Bearer token auth.

import {
  Plugin,
  type PluginContext,
  type PluginManifest,
  type PluginAction,
} from "../types";

const ACTIONS: PluginAction[] = [
  {
    name: "send-message",
    description: "Send a message to a channel or DM.",
    params: {
      channel: { type: "string", required: true, label: "Channel name or ID" },
      text: { type: "string", required: true, label: "Message text" },
      blocks: { type: "string", description: "Optional Slack Block Kit JSON" },
    },
    result: { type: "object", description: "Slack API response" },
  },
  {
    name: "search-messages",
    description: "Search messages in accessible channels.",
    params: { query: { type: "string", required: true } },
    result: { type: "array", description: "Matching messages" },
  },
  {
    name: "list-channels",
    description: "List channels the bot can access.",
    params: {},
    result: { type: "array", description: "Channel metadata" },
  },
  {
    name: "notify",
    description: "Post a deployment or alert notification (formatted).",
    params: {
      title: { type: "string", required: true },
      text: { type: "string", required: true },
      level: { type: "select", options: ["info", "success", "warning", "error"], default: "info" },
    },
    result: { type: "object", description: "Slack API response" },
  },
];

const MANIFEST: PluginManifest = {
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
  actions: ACTIONS,
};

// ────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;

// Actions exposed beyond the manifest's ACTIONS array (still supported by
// execute() but not advertised in the UI catalog).
const EXTRA_ACTIONS = new Set(["get-history", "list-users"]);

const LEVEL_EMOJI: Record<string, string> = {
  info: ":information_source:",
  success: ":white_check_mark:",
  warning: ":warning:",
  error: ":rotating_light:",
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function isStringRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Slack always returns HTTP 200 with `{ ok: true|false, ... }` in the body.
 * This helper checks both the HTTP status and the body's `ok` field, throwing
 * a clean Error on any failure.
 */
async function slackRequest(
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
        "Content-Type": "application/json; charset=utf-8",
      },
      body: init.body,
      signal: controller.signal,
    });
    if (!res.ok) {
      let errBody: unknown = null;
      try {
        errBody = await res.text();
      } catch {
        errBody = null;
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Slack authentication failed (${res.status}). Verify the bot token (xoxb-...).`,
        );
      }
      if (res.status === 429) {
        const retry = res.headers.get("retry-after");
        throw new Error(
          `Slack rate limit hit (429). Retry after ${retry ?? "60"}s.`,
        );
      }
      const errStr = typeof errBody === "string" ? errBody.slice(0, 500) : JSON.stringify(errBody);
      throw new Error(`Slack HTTP ${res.status} ${res.statusText}: ${errStr}`);
    }

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      const text = await res.text().catch(() => "");
      throw new Error(`Slack API returned non-JSON response: ${text.slice(0, 300)}`);
    }
    const data: unknown = await res.json();
    if (!isStringRecord(data)) {
      throw new Error("Slack API returned an unexpected response shape");
    }
    if (data.ok === false) {
      const errField = asString(data.error) ?? "unknown_error";
      // Friendlier hints for common Slack errors
      if (errField === "missing_scope" || errField === "not_allowed_token_type") {
        throw new Error(
          `Slack API error: ${errField}. The bot token is missing required OAuth scopes.`,
        );
      }
      if (errField === "channel_not_found") {
        throw new Error(
          `Slack API error: channel_not_found. The bot is not in the channel, or the channel ID/name is wrong.`,
        );
      }
      throw new Error(`Slack API error: ${errField}`);
    }
    return data;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Slack API request timed out after ${timeoutMs}ms`);
    }
    if (err instanceof TypeError) {
      throw new Error(`Slack API network error: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Plugin class
// ────────────────────────────────────────────────────────────────────────────

export class SlackPlugin extends Plugin {
  readonly id = "slack";
  private ctx?: PluginContext;

  getManifest(): PluginManifest {
    return MANIFEST;
  }

  async onActivate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    const token = asString(ctx.config.botToken);
    if (!token) {
      ctx.log("warn", "Slack plugin activated without a bot token — API calls will fail");
    } else {
      ctx.log("info", `Slack plugin activated (default channel: ${ctx.config.channel ?? "n/a"})`);
    }
  }

  async onDeactivate(): Promise<void> {
    this.ctx?.log("info", "Slack plugin deactivated");
    this.ctx = undefined;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<unknown> {
    this.ctx?.log("debug", `execute(${action})`, params);

    const known = ACTIONS.find((a) => a.name === action);
    if (!known && !EXTRA_ACTIONS.has(action)) {
      throw new Error(`Unknown action: ${action}`);
    }

    const token = asString(this.ctx?.config.botToken);
    if (!token) {
      return {
        ok: false,
        action,
        error: "Slack bot token not configured. Set the 'botToken' field in plugin config.",
      };
    }

    const baseUrl = (asString(this.ctx?.config.baseUrl) ?? "https://slack.com/api").replace(/\/$/, "");

    try {
      switch (action) {
        case "send-message": {
          const channel = asString(params.channel) ?? asString(this.ctx?.config.channel);
          const text = asString(params.text);
          if (!channel) {
            return { ok: false, action, error: "channel is required (or set a default channel in config)" };
          }
          if (!text) {
            return { ok: false, action, error: "text is required" };
          }
          const url = `${baseUrl}/chat.postMessage`;
          const body: Record<string, unknown> = { channel, text };
          // Optional Slack Block Kit blocks (JSON string or parsed array)
          if (typeof params.blocks === "string") {
            try {
              body.blocks = JSON.parse(params.blocks) as unknown;
            } catch {
              return { ok: false, action, error: "blocks must be valid JSON" };
            }
          } else if (Array.isArray(params.blocks)) {
            body.blocks = params.blocks;
          }
          this.ctx?.log("info", `Slack send-message: POST ${url}`, { channel, textLength: text.length });
          const data = await slackRequest(url, token, {
            method: "POST",
            body: JSON.stringify(body),
          });
          return { ok: true, action, data };
        }

        case "list-channels": {
          const url = `${baseUrl}/conversations.list?types=public_channel,private_channel&limit=200`;
          this.ctx?.log("info", `Slack list-channels: GET ${url}`);
          const data = await slackRequest(url, token);
          const channels = isStringRecord(data) && Array.isArray(data.channels) ? data.channels : [];
          return { ok: true, action, count: channels.length, data: channels };
        }

        case "get-history": {
          const channel = asString(params.channel);
          if (!channel) {
            return { ok: false, action, error: "channel is required" };
          }
          const limit = typeof params.limit === "number" ? params.limit : 20;
          const url = `${baseUrl}/conversations.history?channel=${encodeURIComponent(channel)}&limit=${limit}`;
          this.ctx?.log("info", `Slack get-history: GET ${url}`);
          const data = await slackRequest(url, token);
          const messages = isStringRecord(data) && Array.isArray(data.messages) ? data.messages : [];
          return { ok: true, action, count: messages.length, data: messages };
        }

        case "search-messages": {
          const query = asString(params.query);
          if (!query) {
            return { ok: false, action, error: "query is required" };
          }
          const url = `${baseUrl}/search.messages?query=${encodeURIComponent(query)}&count=50`;
          this.ctx?.log("info", `Slack search-messages: GET ${url}`);
          const data = await slackRequest(url, token);
          // Response shape: { ok, messages: { matches: [...], ... } }
          const messagesRoot = isStringRecord(data) ? data.messages : undefined;
          const matches = isStringRecord(messagesRoot) && Array.isArray(messagesRoot.matches)
            ? messagesRoot.matches
            : [];
          return { ok: true, action, count: matches.length, data: matches };
        }

        case "list-users": {
          const url = `${baseUrl}/users.list?limit=200`;
          this.ctx?.log("info", `Slack list-users: GET ${url}`);
          const data = await slackRequest(url, token);
          const members = isStringRecord(data) && Array.isArray(data.members) ? data.members : [];
          return { ok: true, action, count: members.length, data: members };
        }

        case "notify": {
          const channel = asString(params.channel) ?? asString(this.ctx?.config.channel);
          if (!channel) {
            return { ok: false, action, error: "channel is required (or set a default channel in config)" };
          }
          const title = asString(params.title);
          const text = asString(params.text);
          if (!title || !text) {
            return { ok: false, action, error: "title and text are required" };
          }
          const level = asString(params.level) ?? "info";
          const emoji = LEVEL_EMOJI[level] ?? LEVEL_EMOJI.info;
          const formatted = `${emoji} *${title}*\n${text}`;
          const url = `${baseUrl}/chat.postMessage`;
          const body: Record<string, unknown> = { channel, text: formatted };
          this.ctx?.log("info", `Slack notify [${level}]: POST ${url}`, { channel, title });
          const data = await slackRequest(url, token, {
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
      this.ctx?.log("error", `Slack ${action} failed: ${msg}`);
      return { ok: false, action, error: msg };
    }
  }
}

export const slackPlugin = new SlackPlugin();
