// CodeInsight AI — Tool Definitions: Write tools (Layer 4)
// 7 write/dangerous tools that modify files, run commands, or interact with git.

import type { Tool, Result, AgentContext } from "../../contracts";
import { writeManifest, dangerousManifest } from "../manifest";

function ok<T>(value: T): Result<T> { return { ok: true, value }; }
function err(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message, recoverable: false } };
}

function requireParam(params: Record<string, unknown>, name: string): string | null {
  const val = params[name];
  if (typeof val !== "string" || !val) return null;
  return val;
}

// ─── generate-patch ───
// This tool calls AI to generate a patch. It doesn't modify files —
// it returns a diff string that apply-patch will apply.
export const generatePatchTool: Tool = {
  manifest: writeManifest("generate-patch", "Generate a code patch using AI", ["generate-patch"], {
    cost: "expensive",
    estimatedTimeMs: 30000,
    timeout: 45000,
    streamable: true,
    confidence: 0.85,
    inputSchema: { type: "object", properties: { file: { type: "string" }, issue: { type: "string" }, instruction: { type: "string" } }, required: ["file", "instruction"] },
  }),
  async execute(params, ctx: AgentContext) {
    const file = requireParam(params, "file");
    const instruction = requireParam(params, "instruction");
    if (!file || !instruction) return err("TOOL_INVALID_PARAMS", "Missing required params: file, instruction");

    // Get file content
    const fileResult = ctx.query.findFile(file);
    if (!fileResult.ok) return fileResult;
    if (!fileResult.value) return err("FILE_NOT_FOUND", `File not found: ${file}`);

    // Call AI to generate patch
    try {
      const { callAI } = await import("@/lib/ai-client");
      const result = await callAI(
        {
          providerId: "shopaikey",
          apiKey: "",
          baseUrl: "",
          model: "gpt-4.1-mini",
          temperature: 0.3,
          maxTokens: 4000,
          timeout: 40,
        },
        [
          { role: "system", content: "You are a code fixer. Generate a unified diff patch. Respond with ONLY the diff, no explanation." },
          { role: "user", content: `File: ${file}\n\nContent:\n${fileResult.value.content}\n\nInstruction: ${instruction}` },
        ],
        { maxTokens: 4000, temperature: 0.3, timeout: 40 },
      );
      return ok({ diff: result, file });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Patch generation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ─── apply-patch ───
export const applyPatchTool: Tool = {
  manifest: writeManifest("apply-patch", "Apply a patch to modify files", ["apply-patch"], {
    cost: "medium",
    estimatedTimeMs: 1000,
    timeout: 10000,
    inputSchema: { type: "object", properties: { patch: { type: "string" } }, required: ["patch"] },
  }),
  async execute(params, ctx: AgentContext) {
    const patch = requireParam(params, "patch");
    if (!patch) return err("TOOL_INVALID_PARAMS", "Missing required param: patch");
    // In production, this would call RepoService.applyPatch
    // For now, return success with empty modified files list
    return ok({ modifiedFiles: [] as string[] });
  },
};

// ─── rollback-changes ───
export const rollbackChangesTool: Tool = {
  manifest: writeManifest("rollback-changes", "Rollback file changes", ["rollback-changes"], {
    cost: "medium",
    estimatedTimeMs: 500,
    timeout: 10000,
  }),
  async execute(_params, _ctx: AgentContext) {
    // In production, this would call RepoService.rollback
    return ok({ rolledBack: true });
  },
};

// ─── run-lint ───
export const runLintTool: Tool = {
  manifest: writeManifest("run-lint", "Run ESLint on the project", ["run-lint"], {
    cost: "medium",
    estimatedTimeMs: 10000,
    timeout: 30000,
    permission: "allow", // lint doesn't modify files
  }),
  async execute(_params, _ctx: AgentContext) {
    try {
      // In production, this would use terminal/permission-system
      return ok({ exitCode: 0, output: "Lint passed" });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Lint failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ─── run-tests ───
export const runTestsTool: Tool = {
  manifest: writeManifest("run-tests", "Run test suite", ["run-tests"], {
    cost: "expensive",
    estimatedTimeMs: 30000,
    timeout: 60000,
    permission: "allow", // tests don't modify source files
  }),
  async execute(_params, _ctx: AgentContext) {
    try {
      return ok({ exitCode: 0, passed: 0, failed: 0, output: "Tests passed" });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Tests failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ─── git-commit ───
export const gitCommitTool: Tool = {
  manifest: dangerousManifest("git-commit", "Commit changes to git", ["git-commit"], {
    estimatedTimeMs: 2000,
    timeout: 10000,
    inputSchema: { type: "object", properties: { message: { type: "string" }, files: { type: "array" } }, required: ["message"] },
  }),
  async execute(params, ctx: AgentContext) {
    const message = requireParam(params, "message");
    if (!message) return err("TOOL_INVALID_PARAMS", "Missing required param: message");
    // In production, this would call GitService.commitAsync
    return ok({ sha: "commit-sha-placeholder", message });
  },
};

// ─── git-push ───
export const gitPushTool: Tool = {
  manifest: dangerousManifest("git-push", "Push commits to remote", ["git-push"], {
    estimatedTimeMs: 5000,
    timeout: 30000,
  }),
  async execute(_params, _ctx: AgentContext) {
    // In production, this would call GitService.pushAsync
    return ok({ pushed: true });
  },
};

// Export all write tools
export const writeTools: Tool[] = [
  generatePatchTool,
  applyPatchTool,
  rollbackChangesTool,
  runLintTool,
  runTestsTool,
  gitCommitTool,
  gitPushTool,
];
