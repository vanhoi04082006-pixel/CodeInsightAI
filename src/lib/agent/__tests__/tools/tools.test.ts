// CodeInsight AI — Tool Registry + Capability Registry Tests (Layer 4)

import { describe, it, expect } from "@jest/globals";
import { createRegistries, ToolRegistryImpl, CapabilityRegistryImpl } from "@/lib/agent/tools";
import { readOnlyTools, writeTools } from "@/lib/agent/tools";
import type { Tool, ToolManifest } from "@/lib/agent/contracts";

describe("ToolRegistry", () => {
  const { toolRegistry } = createRegistries();

  it("should register all 26 tools", () => {
    expect((toolRegistry as ToolRegistryImpl).count()).toBe(26);
  });

  it("should get tool by name", () => {
    const tool = toolRegistry.get("find-symbol");
    expect(tool).not.toBeNull();
    expect(tool!.manifest.name).toBe("find-symbol");
  });

  it("should return null for non-existent tool", () => {
    expect(toolRegistry.get("non-existent")).toBeNull();
  });

  it("should get manifest by name", () => {
    const manifest = toolRegistry.getManifest("find-impact");
    expect(manifest).not.toBeNull();
    expect(manifest!.name).toBe("find-impact");
    expect(manifest!.capabilities).toContain("find-impact");
  });

  it("should list tools by capability", () => {
    const manifests = toolRegistry.listByCapability("find-issues");
    expect(manifests).toHaveLength(1);
    expect(manifests[0].name).toBe("find-issues");
  });

  it("should list tools by permission (allow)", () => {
    const allowTools = toolRegistry.listByPermission("allow");
    // Read-only tools should all be "allow"
    expect(allowTools.length).toBeGreaterThanOrEqual(13);
    for (const m of allowTools) {
      expect(m.permission).toBe("allow");
    }
  });

  it("should list tools by permission (prompt)", () => {
    const promptTools = toolRegistry.listByPermission("prompt");
    expect(promptTools.length).toBeGreaterThanOrEqual(5);
    for (const m of promptTools) {
      expect(m.permission).toBe("prompt");
    }
  });

  it("should list all tool names", () => {
    const all = (toolRegistry as ToolRegistryImpl).listAll();
    expect(all).toHaveLength(26);
    expect(all).toContain("find-symbol");
    expect(all).toContain("generate-patch");
    expect(all).toContain("git-commit");
  });
});

describe("CapabilityRegistry", () => {
  const { toolRegistry, capabilityRegistry } = createRegistries();

  it("should resolve capability to tool name", () => {
    expect(capabilityRegistry.resolve("find-symbol")).toBe("find-symbol");
    expect(capabilityRegistry.resolve("find-impact")).toBe("find-impact");
    expect(capabilityRegistry.resolve("generate-patch")).toBe("generate-patch");
    expect(capabilityRegistry.resolve("git-commit")).toBe("git-commit");
  });

  it("should return null for unknown capability", () => {
    expect(capabilityRegistry.resolve("non-existent" as any)).toBeNull();
  });

  it("should list capabilities of a tool", () => {
    const caps = capabilityRegistry.capabilitiesOf("open-file");
    expect(caps).toContain("open-file");
    expect(caps).toContain("read-file");
  });

  it("should return empty for unknown tool", () => {
    expect(capabilityRegistry.capabilitiesOf("non-existent")).toEqual([]);
  });

  it("should register multiple tools for same capability with priority", () => {
    const cap = new CapabilityRegistryImpl();
    cap.register("find-symbol" as any, "tool-a", 2);
    cap.register("find-symbol" as any, "tool-b", 1); // higher priority (lower number)
    expect(cap.resolve("find-symbol" as any)).toBe("tool-b"); // tool-b wins
  });

  it("should list all capabilities", () => {
    const capReg = capabilityRegistry as CapabilityRegistryImpl;
    const caps = capReg.listCapabilities();
    expect(caps.length).toBeGreaterThanOrEqual(20);
    expect(caps).toContain("find-symbol");
    expect(caps).toContain("git-push");
    expect(caps).toContain("get-diagram");
  });
});

describe("Tool Manifests", () => {
  const { toolRegistry } = createRegistries();

  it("read-only tools should have permission=allow", () => {
    for (const tool of readOnlyTools) {
      expect(tool.manifest.permission).toBe("allow");
      expect(tool.manifest.parallelSafe).toBe(true);
      expect(tool.manifest.cacheable).toBe(true);
    }
  });

  it("write tools should have permission=prompt", () => {
    const writeToolNames = writeTools.map((t) => t.manifest.name);
    for (const name of writeToolNames) {
      const manifest = toolRegistry.getManifest(name);
      expect(manifest).not.toBeNull();
      // run-lint and run-tests have permission overridden to "allow"
      if (name !== "run-lint" && name !== "run-tests") {
        expect(manifest!.permission).toBe("prompt");
      }
    }
  });

  it("git-commit should be expensive", () => {
    const manifest = toolRegistry.getManifest("git-commit");
    expect(manifest).not.toBeNull();
    // git-commit uses dangerousManifest which is "expensive"
    expect(manifest!.cost).toBe("expensive");
    expect(manifest!.maxRetries).toBe(0); // no retry for dangerous
  });

  it("generate-patch should be streamable", () => {
    const manifest = toolRegistry.getManifest("generate-patch");
    expect(manifest).not.toBeNull();
    expect(manifest!.streamable).toBe(true);
  });

  it("all tools should have confidence between 0 and 1", () => {
    const all = (toolRegistry as ToolRegistryImpl).listAllManifests();
    for (const m of all) {
      expect(m.confidence).toBeGreaterThanOrEqual(0);
      expect(m.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("all tools should have timeout > 0", () => {
    const all = (toolRegistry as ToolRegistryImpl).listAllManifests();
    for (const m of all) {
      expect(m.timeout).toBeGreaterThan(0);
    }
  });

  it("all tools should have inputSchema and outputSchema", () => {
    const all = (toolRegistry as ToolRegistryImpl).listAllManifests();
    for (const m of all) {
      expect(m.inputSchema).toBeDefined();
      expect(m.inputSchema.type).toBe("object");
      expect(m.outputSchema).toBeDefined();
      expect(m.outputSchema.type).toBe("object");
    }
  });
});

describe("Tool Execution", () => {
  // Tools need AgentContext — we test the manifest/registry, not actual execution
  // (execution is tested in Phase 8 Runtime integration tests)

  it("all tools should have execute function", () => {
    for (const tool of [...readOnlyTools, ...writeTools]) {
      expect(typeof tool.execute).toBe("function");
    }
  });
});
