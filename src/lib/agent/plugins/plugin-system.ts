// CodeInsight AI — Stage 7.1: Plugin System
// PluginManifest defines a third-party extension that can add tools, skills,
// or agent profiles to the platform. Plugins are stored in DB and loaded
// at runtime by the PluginLoader.

import type {
  Tool,
  ToolRegistry,
  Capability,
  CapabilityRegistry,
  Skill,
  SkillRegistry,
  ExecutionPlan,
} from "../contracts";
import type { AgentProfile } from "../multi-agent/profiles";

// ─── Plugin Types ────────────────────────────────────────────────────

export type PluginType = "tool" | "skill" | "agent-profile" | "composite";

export interface PluginManifest {
  /** Unique plugin ID (e.g. "eslint-rules") */
  id: string;
  /** Display name */
  name: string;
  /** Version (semver) */
  version: string;
  /** Author */
  author: string;
  /** Plugin type */
  type: PluginType;
  /** Short description */
  description: string;
  /** Icon (emoji) */
  icon: string;
  /** Plugin definition (type-specific) */
  definition: PluginDefinition;
  /** Whether plugin is verified by platform */
  verified: boolean;
  /** Install count */
  installs: number;
}

export interface PluginDefinition {
  /** For type="tool": Tool object to register */
  tool?: Tool;
  /** For type="skill": Skill object to register */
  skill?: Skill;
  /** For type="agent-profile": AgentProfile to register */
  agentProfile?: AgentProfile;
  /** For type="composite": multiple definitions */
  tools?: Tool[];
  skills?: Skill[];
  agentProfiles?: AgentProfile[];
}

/**
 * Plugin interface — what a plugin module exports.
 * Compatible with existing AgentPlugin interface (contracts Section 20).
 */
export interface Plugin {
  manifest: PluginManifest;

  // Lifecycle hooks
  onInstall?(registries: PluginRegistries): void;
  onUninstall?(registries: PluginRegistries): void;

  // Runtime hooks (optional)
  onPlanGenerated?(plan: ExecutionPlan): void;
  onNodeStarted?(nodeId: string): void;
  onNodeCompleted?(nodeId: string, result: unknown): void;
  onTaskCompleted?(summary: string): void;
}

export interface PluginRegistries {
  toolRegistry: ToolRegistry;
  skillRegistry: SkillRegistry;
  capabilityRegistry: CapabilityRegistry;
  agentProfiles: Map<string, AgentProfile>;
}

// ─── Plugin Loader ───────────────────────────────────────────────────

/**
 * PluginLoader manages installed plugins.
 * Loads from DB on startup, registers into registries.
 */
export class PluginLoader {
  private plugins = new Map<string, Plugin>();
  private registries: PluginRegistries;

  constructor(registries: PluginRegistries) {
    this.registries = registries;
  }

  /** Install a plugin (register its definitions) */
  install(plugin: Plugin): void {
    const { manifest, onInstall } = plugin;
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin already installed: ${manifest.id}`);
    }

    // Register definitions based on type
    const def = manifest.definition;
    if (def.tool) {
      this.registries.toolRegistry.register(def.tool);
    }
    if (def.tools) {
      for (const tool of def.tools) {
        this.registries.toolRegistry.register(tool);
      }
    }
    if (def.skill) {
      this.registries.skillRegistry.register(def.skill);
    }
    if (def.skills) {
      for (const skill of def.skills) {
        this.registries.skillRegistry.register(skill);
      }
    }
    if (def.agentProfile) {
      this.registries.agentProfiles.set(def.agentProfile.id, def.agentProfile);
    }
    if (def.agentProfiles) {
      for (const profile of def.agentProfiles) {
        this.registries.agentProfiles.set(profile.id, profile);
      }
    }

    // Call lifecycle hook
    onInstall?.(this.registries);

    this.plugins.set(manifest.id, plugin);
  }

  /** Uninstall a plugin (deregister) */
  uninstall(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    plugin.onUninstall?.(this.registries);
    this.plugins.delete(pluginId);
    // Note: ToolRegistry/SkillRegistry don't have unregister —
    // plugins are removed on next server restart.
  }

  /** Get all installed plugins */
  list(): Plugin[] {
    return [...this.plugins.values()];
  }

  /** Get plugin by ID */
  get(id: string): Plugin | null {
    return this.plugins.get(id) ?? null;
  }

  /** Check if plugin is installed */
  has(id: string): boolean {
    return this.plugins.has(id);
  }

  /** Count installed plugins */
  count(): number {
    return this.plugins.size;
  }
}

// ─── Built-in Plugins (ship with platform) ───────────────────────────

/**
 * Example built-in plugin: adds a "code-smell-detector" tool.
 * This demonstrates the plugin system and ships with the platform.
 */
export const codeSmellDetectorPlugin: Plugin = {
  manifest: {
    id: "code-smell-detector",
    name: "Code Smell Detector",
    version: "1.0.0",
    author: "CodeInsight AI",
    type: "tool",
    description: "Detects common code smells: long functions, deep nesting, too many parameters",
    icon: "👃",
    verified: true,
    installs: 0,
    definition: {
      tool: {
        manifest: {
          name: "code-smell-detector",
          description: "Detect common code smells (long functions, deep nesting, too many params)",
          capabilities: ["find-issues" as Capability],
          cost: "cheap" as const,
          estimatedTimeMs: 2000,
          permission: "allow" as const,
          timeout: 10000,
          parallel: true,
          parallelSafe: true,
          cacheable: true,
          cacheTtl: 300000,
          streamable: false,
          confidence: 0.8,
          maxRetries: 0,
          inputSchema: { type: "object", properties: { file: { type: "string" } }, required: ["file"] },
          outputSchema: { type: "object", properties: {}, required: [] },
        },
        async execute(params, ctx) {
          const file = params.file as string;
          if (!file) return { ok: false, error: { code: "TOOL_INVALID_PARAMS", message: "Missing 'file'", recoverable: false } };

          const fileResult = ctx.query.findFile(file);
          if (!fileResult.ok || !fileResult.value) {
            return { ok: false, error: { code: "FILE_NOT_FOUND", message: `File not found: ${file}`, recoverable: false } };
          }

          const content = fileResult.value.content || "";
          const lines = content.split("\n");
          const smells: { type: string; line: number; severity: string; message: string }[] = [];

          // Detect long functions (>50 lines)
          let funcStart = -1;
          let funcName = "";
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/function\s+\w+|=>\s*{/)) {
              funcStart = i;
              funcName = lines[i].match(/function\s+(\w+)/)?.[1] || "anonymous";
            }
            if (funcStart >= 0 && lines[i].trim() === "}" && i - funcStart > 50) {
              smells.push({
                type: "long-function",
                line: funcStart + 1,
                severity: "medium",
                message: `Function "${funcName}" is ${i - funcStart} lines long (threshold: 50)`,
              });
              funcStart = -1;
            }
          }

          // Detect deep nesting (>5 levels)
          for (let i = 0; i < lines.length; i++) {
            const indent = (lines[i].match(/^\s*/)?.[0] || "").length;
            if (indent > 20 && lines[i].trim().length > 0) {
              smells.push({
                type: "deep-nesting",
                line: i + 1,
                severity: "low",
                message: `Deep nesting (${Math.floor(indent / 4)} levels) at line ${i + 1}`,
              });
            }
          }

          // Detect too many parameters (>5)
          for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/function\s+\w+\s*\(([^)]+)\)/);
            if (match) {
              const params = match[1].split(",").filter((p) => p.trim().length > 0);
              if (params.length > 5) {
                smells.push({
                  type: "too-many-params",
                  line: i + 1,
                  severity: "medium",
                  message: `Function has ${params.length} parameters (threshold: 5)`,
                });
              }
            }
          }

          return {
            ok: true,
            value: {
              file,
              smellCount: smells.length,
              smells: smells.slice(0, 20), // cap at 20
              summary: smells.length === 0 ? "No code smells detected" : `Found ${smells.length} code smell(s)`,
            },
          };
        },
      },
    },
  },
};

/**
 * All built-in plugins that ship with the platform.
 */
export const BUILTIN_PLUGINS: Plugin[] = [
  codeSmellDetectorPlugin,
];

/**
 * Available plugins for the marketplace (not yet installed).
 * In production, this would come from a plugin registry API.
 */
export const MARKETPLACE_PLUGINS: PluginManifest[] = [
  {
    id: "code-smell-detector",
    name: "Code Smell Detector",
    version: "1.0.0",
    author: "CodeInsight AI",
    type: "tool",
    description: "Detects common code smells: long functions, deep nesting, too many parameters",
    icon: "👃",
    verified: true,
    installs: 1247,
    definition: {},
  },
  {
    id: "eslint-custom-rules",
    name: "ESLint Custom Rules",
    version: "2.1.0",
    author: "Community",
    type: "tool",
    description: "Add custom ESLint rules as Agent tools for project-specific linting",
    icon: "📏",
    verified: false,
    installs: 342,
    definition: {},
  },
  {
    id: "docker-optimizer",
    name: "Docker Optimizer",
    version: "1.2.0",
    author: "DevOps Community",
    type: "agent-profile",
    description: "Specialized agent for Dockerfile optimization and container best practices",
    icon: "🐳",
    verified: true,
    installs: 891,
    definition: {},
  },
  {
    id: "api-docs-generator",
    name: "API Docs Generator",
    version: "3.0.0",
    author: "OpenAPI Community",
    type: "skill",
    description: "Generate OpenAPI/Swagger documentation from code automatically",
    icon: "📖",
    verified: true,
    installs: 2156,
    definition: {},
  },
  {
    id: "test-coverage-analyzer",
    name: "Test Coverage Analyzer",
    version: "1.5.0",
    author: "Testing Community",
    type: "composite",
    description: "Analyze test coverage + generate missing tests + report uncovered paths",
    icon: "🧪",
    verified: false,
    installs: 567,
    definition: {},
  },
];
