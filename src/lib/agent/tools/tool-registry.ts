// CodeInsight AI — Tool Registry (Layer 4)
// Registers tools with manifests. Provides lookup by name, capability, permission.

import type {
  Tool,
  ToolManifest,
  ToolRegistry as IToolRegistry,
  Capability,
  PermissionLevel,
} from "../contracts";

export class ToolRegistryImpl implements IToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly manifests = new Map<string, ToolManifest>();

  register(tool: Tool): void {
    this.tools.set(tool.manifest.name, tool);
    this.manifests.set(tool.manifest.name, tool.manifest);
  }

  get(name: string): Tool | null {
    return this.tools.get(name) ?? null;
  }

  getManifest(name: string): ToolManifest | null {
    return this.manifests.get(name) ?? null;
  }

  listByCapability(capability: Capability): ToolManifest[] {
    const result: ToolManifest[] = [];
    for (const manifest of this.manifests.values()) {
      if (manifest.capabilities.includes(capability)) {
        result.push(manifest);
      }
    }
    return result;
  }

  listByPermission(level: PermissionLevel): ToolManifest[] {
    const result: ToolManifest[] = [];
    for (const manifest of this.manifests.values()) {
      if (manifest.permission === level) {
        result.push(manifest);
      }
    }
    return result;
  }

  /** List all registered tool names */
  listAll(): string[] {
    return [...this.tools.keys()];
  }

  /** List all manifests */
  listAllManifests(): ToolManifest[] {
    return [...this.manifests.values()];
  }

  /** Count registered tools */
  count(): number {
    return this.tools.size;
  }
}
