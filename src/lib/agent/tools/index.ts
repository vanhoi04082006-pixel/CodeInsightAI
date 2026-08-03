// CodeInsight AI — Tools Public API (Layer 4)
// Barrel export for Tool Registry + Capability Registry + definitions.

export type {
  Tool,
  ToolManifest,
  ToolRegistry,
  CapabilityRegistry,
  Capability,
  PermissionLevel,
  JSONSchema,
  ToolStreamChunk,
} from "../contracts";

export { ToolRegistryImpl } from "./tool-registry";
export { CapabilityRegistryImpl } from "./capability-registry";
export { readOnlyManifest, writeManifest, dangerousManifest } from "./manifest";
export { createToolRegistry, createCapabilityRegistry, createRegistries } from "./register-all";

// Export individual tools for testing
export { readOnlyTools } from "./definitions/read-only-tools";
export { writeTools } from "./definitions/write-tools";
export { additionalTools } from "./definitions/additional-tools";
