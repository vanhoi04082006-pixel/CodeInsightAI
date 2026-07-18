// CodeInsight AI — Plugin SDK index
// Re-exports types, the PluginManager singleton, and all built-in stub plugins.

// Core types & base class
export {
  Plugin,
  type PluginCategory,
  type PluginCapability,
  type PluginCapabilityKind,
  type PluginManifest,
  type PluginConfigField,
  type PluginAction,
  type PluginContext,
  type PluginLogLevel,
  type PluginEvent,
  type PluginError,
  type PluginResult,
} from "./types";

// Manager + catalog
export {
  pluginManager,
  PluginManager,
  BUILTIN_MANIFESTS,
} from "./plugin-manager";

// Built-in stub plugins (manifests complete, HTTP calls stubbed)
export { githubPlugin, GitHubPlugin } from "./builtins/github-plugin";
export { gitlabPlugin, GitLabPlugin } from "./builtins/gitlab-plugin";
export { slackPlugin, SlackPlugin } from "./builtins/slack-plugin";
export { notionPlugin, NotionPlugin } from "./builtins/notion-plugin";
export { jiraPlugin, JiraPlugin } from "./builtins/jira-plugin";

/**
 * Register all built-in stub plugins. Call once at app boot if you want all
 * built-ins active by default. Each plugin will log a warning if its required
 * config is missing.
 */
export async function registerBuiltinPlugins(): Promise<void> {
  const { pluginManager } = await import("./plugin-manager");
  const { githubPlugin } = await import("./builtins/github-plugin");
  const { gitlabPlugin } = await import("./builtins/gitlab-plugin");
  const { slackPlugin } = await import("./builtins/slack-plugin");
  const { notionPlugin } = await import("./builtins/notion-plugin");
  const { jiraPlugin } = await import("./builtins/jira-plugin");

  const plugins = [githubPlugin, gitlabPlugin, slackPlugin, notionPlugin, jiraPlugin];
  for (const p of plugins) {
    try {
      await pluginManager.register(p, {});
    } catch {
      // already registered — skip
    }
  }
}
