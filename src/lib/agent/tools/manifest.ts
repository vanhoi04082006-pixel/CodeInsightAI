// CodeInsight AI — Tool Manifest Helpers (Layer 4)
// Helper functions for creating common tool manifests.

import type { ToolManifest, Capability, PermissionLevel, JSONSchema } from "../contracts";

/** Create a read-only tool manifest (permission: allow, cacheable) */
export function readOnlyManifest(
  name: string,
  description: string,
  capabilities: Capability[],
  options?: {
    cost?: "cheap" | "medium" | "expensive";
    estimatedTimeMs?: number;
    timeout?: number;
    cacheable?: boolean;
    cacheTtl?: number;
    streamable?: boolean;
    confidence?: number;
    inputSchema?: JSONSchema;
    outputSchema?: JSONSchema;
  },
): ToolManifest {
  return {
    name,
    description,
    capabilities,
    cost: options?.cost ?? "cheap",
    estimatedTimeMs: options?.estimatedTimeMs ?? 100,
    permission: "allow",
    timeout: options?.timeout ?? 5000,
    parallel: true,
    parallelSafe: true,
    cacheable: options?.cacheable ?? true,
    cacheTtl: options?.cacheTtl ?? 300000, // 5 min
    streamable: options?.streamable ?? false,
    confidence: options?.confidence ?? 1.0,
    maxRetries: 0,
    inputSchema: options?.inputSchema ?? { type: "object", properties: {}, required: [] },
    outputSchema: options?.outputSchema ?? { type: "object", properties: {}, required: [] },
  };
}

/** Create a write tool manifest (permission: prompt, not cacheable) */
export function writeManifest(
  name: string,
  description: string,
  capabilities: Capability[],
  options?: {
    cost?: "cheap" | "medium" | "expensive";
    estimatedTimeMs?: number;
    timeout?: number;
    streamable?: boolean;
    confidence?: number;
    permission?: PermissionLevel;
    inputSchema?: JSONSchema;
    outputSchema?: JSONSchema;
  },
): ToolManifest {
  return {
    name,
    description,
    capabilities,
    cost: options?.cost ?? "medium",
    estimatedTimeMs: options?.estimatedTimeMs ?? 1000,
    permission: options?.permission ?? "prompt",
    timeout: options?.timeout ?? 30000,
    parallel: false,
    parallelSafe: false,
    cacheable: false,
    cacheTtl: 0,
    streamable: options?.streamable ?? false,
    confidence: options?.confidence ?? 0.9,
    maxRetries: 1,
    inputSchema: options?.inputSchema ?? { type: "object", properties: {}, required: [] },
    outputSchema: options?.outputSchema ?? { type: "object", properties: {}, required: [] },
  };
}

/** Create a dangerous tool manifest (permission: prompt, expensive, not parallel) */
export function dangerousManifest(
  name: string,
  description: string,
  capabilities: Capability[],
  options?: {
    estimatedTimeMs?: number;
    timeout?: number;
    confidence?: number;
    inputSchema?: JSONSchema;
    outputSchema?: JSONSchema;
  },
): ToolManifest {
  return {
    name,
    description,
    capabilities,
    cost: "expensive",
    estimatedTimeMs: options?.estimatedTimeMs ?? 5000,
    permission: "prompt",
    timeout: options?.timeout ?? 60000,
    parallel: false,
    parallelSafe: false,
    cacheable: false,
    cacheTtl: 0,
    streamable: false,
    confidence: options?.confidence ?? 0.85,
    maxRetries: 0, // no retry for dangerous ops
    inputSchema: options?.inputSchema ?? { type: "object", properties: {}, required: [] },
    outputSchema: options?.outputSchema ?? { type: "object", properties: {}, required: [] },
  };
}
