// CodeInsight AI — Tool Registration (Layer 4)
// Registers all 39 tools (20 original + 6 additional + 9 web + 4 autonomous) + their capabilities.

import type { ToolRegistry as IToolRegistry, CapabilityRegistry as ICapabilityRegistry } from "../contracts";
import { ToolRegistryImpl } from "./tool-registry";
import { CapabilityRegistryImpl } from "./capability-registry";
import { readOnlyTools } from "./definitions/read-only-tools";
import { writeTools } from "./definitions/write-tools";
import { additionalTools } from "./definitions/additional-tools";
import { webTools } from "./definitions/web-tools";
import { autonomousTools } from "./definitions/autonomous-tools";

/**
 * Create and populate a ToolRegistry with all 39 tools.
 */
export function createToolRegistry(): IToolRegistry {
  const registry = new ToolRegistryImpl();
  const allTools = [...readOnlyTools, ...writeTools, ...additionalTools, ...webTools, ...autonomousTools];
  for (const tool of allTools) {
    registry.register(tool);
  }
  return registry;
}

/**
 * Create and populate a CapabilityRegistry with all capability→tool mappings.
 */
export function createCapabilityRegistry(
  toolRegistry: IToolRegistry,
): ICapabilityRegistry {
  const capRegistry = new CapabilityRegistryImpl();

  for (const toolName of (toolRegistry as ToolRegistryImpl).listAll()) {
    const manifest = toolRegistry.getManifest(toolName);
    if (!manifest) continue;
    for (const capability of manifest.capabilities) {
      capRegistry.register(capability, toolName, 1);
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
