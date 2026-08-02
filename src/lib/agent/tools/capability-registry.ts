// CodeInsight AI — Capability Registry (Layer 4)
// Maps abstract capabilities ("I need find-symbol") to concrete tools.
// Planner says "I need X", Runtime resolves to best tool via this registry.

import type { Capability, CapabilityRegistry as ICapabilityRegistry } from "../contracts";

interface CapabilityEntry {
  toolName: string;
  priority: number; // lower = higher priority
}

export class CapabilityRegistryImpl implements ICapabilityRegistry {
  private readonly map = new Map<Capability, CapabilityEntry[]>();
  private readonly toolCapabilities = new Map<string, Capability[]>();

  register(capability: Capability, toolName: string, priority: number): void {
    const entries = this.map.get(capability) ?? [];
    entries.push({ toolName, priority });
    entries.sort((a, b) => a.priority - b.priority); // sort by priority (lower first)
    this.map.set(capability, entries);

    // Reverse lookup: tool → capabilities
    const caps = this.toolCapabilities.get(toolName) ?? [];
    if (!caps.includes(capability)) {
      caps.push(capability);
      this.toolCapabilities.set(toolName, caps);
    }
  }

  resolve(capability: Capability): string | null {
    const entries = this.map.get(capability);
    if (!entries || entries.length === 0) return null;
    // Return highest priority (lowest number) tool
    return entries[0].toolName;
  }

  capabilitiesOf(toolName: string): Capability[] {
    return this.toolCapabilities.get(toolName) ?? [];
  }

  /** List all registered capabilities */
  listCapabilities(): Capability[] {
    return [...this.map.keys()];
  }

  /** List all tools registered for a capability (sorted by priority) */
  listToolsForCapability(capability: Capability): string[] {
    const entries = this.map.get(capability) ?? [];
    return entries.map((e) => e.toolName);
  }
}
