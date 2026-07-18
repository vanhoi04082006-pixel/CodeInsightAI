// CodeInsight AI — Plugin SDK: Types (Prompt 14)
// Core type definitions for the plugin system: manifest, capabilities,
// context, and the abstract Plugin base class that all plugins extend.

// ────────────────────────────────────────────────────────────────────────────
// Plugin categories
// ────────────────────────────────────────────────────────────────────────────

export type PluginCategory =
  | "vcs" // Version Control Systems (GitHub, GitLab, Bitbucket)
  | "issue-tracker" // Jira, Linear, YouTrack
  | "chat" // Slack, Discord, Teams
  | "design" // Figma, Sketch
  | "notes" // Notion, Obsidian, Confluence
  | "database" // Supabase, Firebase, PlanetScale
  | "ai-provider"; // OpenRouter, Ollama, Anthropic

// ────────────────────────────────────────────────────────────────────────────
// Capabilities & manifest
// ────────────────────────────────────────────────────────────────────────────

export type PluginCapabilityKind =
  | "read"
  | "write"
  | "webhook"
  | "search"
  | "notify";

export interface PluginCapability {
  kind: PluginCapabilityKind;
  description: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string; // lucide-react icon name or emoji
  color: string; // hex color for UI badges
  category: PluginCategory;
  capabilities: PluginCapability[];
  /**
   * Schema for the configuration this plugin accepts. Keys are field names,
   * values describe the field type so the UI can render a form. Example:
   *   { token: { type: "string", secret: true, required: true } }
   */
  configSchema?: Record<string, PluginConfigField>;
  /** Default actions this plugin exposes (visible in UI). */
  actions?: PluginAction[];
}

export interface PluginConfigField {
  type: "string" | "number" | "boolean" | "select";
  label?: string;
  description?: string;
  required?: boolean;
  secret?: boolean; // mask in UI
  placeholder?: string;
  options?: string[]; // for `select`
  default?: unknown;
}

// ────────────────────────────────────────────────────────────────────────────
// Actions
// ────────────────────────────────────────────────────────────────────────────

export interface PluginAction {
  name: string;
  description: string;
  /** JSON-schema-ish params description (loosely typed for flexibility). */
  params: Record<string, PluginConfigField>;
  /** Expected result shape (loose). */
  result: { type: "object" | "array" | "string" | "boolean" | "void"; description?: string };
}

// ────────────────────────────────────────────────────────────────────────────
// Context — passed to plugins on activation.
// ────────────────────────────────────────────────────────────────────────────

export type PluginLogLevel = "debug" | "info" | "warn" | "error";

export interface PluginEvent {
  type: string;
  data: unknown;
  timestamp: number;
  pluginId: string;
}

export interface PluginContext {
  /** Plugin's resolved config (merged defaults + runtime overrides). */
  config: Record<string, unknown>;
  /** Emit a log message — surfaced in the developer panel. */
  log: (level: PluginLogLevel, message: string, details?: unknown) => void;
  /** Emit a plugin event — other plugins or the host can subscribe. */
  emit: (event: string, data: unknown) => void;
  /** Abort signal — fired when the plugin is being deactivated. */
  signal?: AbortSignal;
}

// ────────────────────────────────────────────────────────────────────────────
// Plugin — abstract base class
// ────────────────────────────────────────────────────────────────────────────

/**
 * Subclass this to implement a plugin. The PluginManager handles the lifecycle:
 *   register → onActivate → execute(...) → onDeactivate → unregister
 */
export abstract class Plugin {
  /** Stable unique identifier (used as the registry key). */
  abstract readonly id: string;
  /** Plugin manifest — capabilities, schema, actions, metadata. */
  abstract getManifest(): PluginManifest;

  /** Called once when the plugin is registered & activated. */
  abstract onActivate(ctx: PluginContext): void | Promise<void>;
  /** Called when the plugin is deactivated or the host is shutting down. */
  abstract onDeactivate(): void | Promise<void>;
  /** Execute a named action with params; returns the action's result. */
  abstract execute(
    action: string,
    params: Record<string, unknown>,
  ): Promise<unknown>;

  // Convenience — exposes the manifest via a property as well.
  get manifest(): PluginManifest {
    return this.getManifest();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Common result/error types
// ────────────────────────────────────────────────────────────────────────────

export interface PluginError {
  pluginId: string;
  action: string;
  error: string;
  details?: unknown;
  timestamp: number;
}

export interface PluginResult<T = unknown> {
  pluginId: string;
  action: string;
  ok: boolean;
  data?: T;
  error?: string;
  durationMs: number;
}
