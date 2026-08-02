// CodeInsight AI — Tool Registration (Layer 4)
// Registers all 20 tools + their capabilities into the registries.

import type { ToolRegistry as IToolRegistry, CapabilityRegistry as ICapabilityRegistry } from "../contracts";
import { ToolRegistryImpl } from "./tool-registry";
import { CapabilityRegistryImpl } from "./capability-registry";
import { readOnlyTools } from "./definitions/read-only-tools";
import { writeTools } from "./definitions/write-tools";

/**
 * Create and populate a ToolRegistry with all 20 tools.
 */
export function createToolRegistry(): IToolRegistry {
  const registry = new ToolRegistryImpl();
  for (const tool of [...readOnlyTools, ...writeTools]) {
    registry.register(tool);
  }
  return registry;
}

/**
 * Create and populate a CapabilityRegistry with all capability→tool mappings.
 * Initial mapping is 1:1 (each capability maps to exactly 1 tool).
 */
export function createCapabilityRegistry(
  toolRegistry: IToolRegistry,
): ICapabilityRegistry {
  const capRegistry = new CapabilityRegistryImpl();

  // For each tool, register its capabilities
  for (const toolName of (toolRegistry as ToolRegistryImpl).listAll()) {
    const manifest = toolRegistry.getManifest(toolName);
    if (!manifest) continue;
    for (const capability of manifest.capabilities) {
      capRegistry.register(capability, toolName, 1); // priority 1 (only tool for this capability)
    }
  }

  return capRegistry;
}

/**
 * Create both registries and return them as a pair.
 */
export function createRegistries() {
  const toolRegistry = createToolRegistry();
  const capabilityRegistry = createCapabilityRegistry(toolRegistry);
  return { toolRegistry, capabilityRegistry };
}
