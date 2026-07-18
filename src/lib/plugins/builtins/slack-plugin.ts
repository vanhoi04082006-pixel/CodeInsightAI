// CodeInsight AI — Plugin SDK: Slack stub plugin
// Concrete plugin for Slack integration. Manifest + actions complete;
// API calls are stubbed.

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

const NOT_IMPLEMENTED =
  "not yet implemented — configure API credentials and implement in builtins/slack-plugin.ts";

const LEVEL_EMOJI: Record<string, string> = {
  info: ":information_source:",
  success: ":white_check_mark:",
  warning: ":warning:",
  error: ":rotating_light:",
};

export class SlackPlugin extends Plugin {
  readonly id = "slack";
  private ctx?: PluginContext;

  getManifest(): PluginManifest {
    return MANIFEST;
  }

  async onActivate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    const token = ctx.config.botToken as string | undefined;
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
    const known = ACTIONS.find((a) => a.name === action);
    if (!known) throw new Error(`Unknown action: ${action}`);
    this.ctx?.log("debug", `execute(${action})`, params);

    // For `notify`, we format a richer block — still returns not-implemented
    // but with the formatting scaffold in place for when the API is wired up.
    if (action === "notify") {
      const level = (params.level as string) ?? "info";
      const title = params.title as string;
      const text = params.text as string;
      return {
        ok: false,
        implemented: false,
        action,
        params,
        message: NOT_IMPLEMENTED,
        preview: {
          text: `${LEVEL_EMOJI[level] ?? ":information_source:"} *${title}*\n${text}`,
          channel: this.ctx?.config.channel ?? "#general",
        },
        hint: "Call POST https://slack.com/api/chat.postMessage with Authorization: Bearer ${botToken}",
      };
    }

    return {
      ok: false,
      implemented: false,
      action,
      params,
      message: NOT_IMPLEMENTED,
      hint: "Fill in builtins/slack-plugin.ts:execute() with fetch() calls to https://slack.com/api/...",
    };
  }
}

export const slackPlugin = new SlackPlugin();
