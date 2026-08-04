// CodeInsight AI — Tool Definitions: Write tools (Layer 4)
// 7 write/dangerous tools that modify files, run commands, or interact with git.
// All write tools use RepoService/GitService async methods — no direct file access.

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
// Calls AI to generate a patch. Doesn't modify files — returns diff string.
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

    const fileResult = ctx.query.findFile(file);
    if (!fileResult.ok) return fileResult;
    if (!fileResult.value) return err("FILE_NOT_FOUND", `File not found: ${file}`);

    try {
      const { callAI } = await import("@/lib/ai-client");
      const { getPlatformAIConfig } = await import("@/lib/platform-ai");
      const provider = await getPlatformAIConfig();
      if (!provider) {
        return err("TOOL_EXECUTION_FAILED", "No AI provider configured. Set PLATFORM_AI_API_KEY env var or configure a platform AI provider.");
      }
      const result = await callAI(
        {
          providerId: provider.providerId,
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
          model: provider.model,
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
      return ok({ diff: result.content, file });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Patch generation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ─── apply-patch ───
// Applies file content changes via RepoService.writeFileAsync.
// Returns the ChangeRecord[] so the ExecutionEngine can track them in the
// runtime's RollbackManager (the tool itself is stateless — it does NOT own
// the rollback manager; the engine does).
export const applyPatchTool: Tool = {
  manifest: writeManifest("apply-patch", "Apply a patch to modify files", ["apply-patch"], {
    cost: "medium",
    estimatedTimeMs: 1000,
    timeout: 10000,
    inputSchema: { type: "object", properties: { patch: { type: "string" }, file: { type: "string" }, content: { type: "string" } }, required: ["file", "content"] },
  }),
  async execute(params, ctx: AgentContext) {
    const file = requireParam(params, "file");
    const content = requireParam(params, "content");
    if (!file || !content) return err("TOOL_INVALID_PARAMS", "Missing required params: file, content");

    try {
      // Import RepoService dynamically to avoid circular deps
      const { RepoServiceImpl } = await import("../../services/repo-service");
      const repo = new RepoServiceImpl();
      const result = await repo.writeFileAsync(file, content);
      if (!result.ok) return result;

      // Return the change log so the engine can track it for rollback.
      const changes = repo.getChangeLog();
      for (const change of changes) {
        ctx.memory?.working?.pushScratch?.(`File modified: ${change.file} (${change.type})`);
      }

      // Emit patch.applied via scratchpad (engine reads the returned changes
      // and tracks them in the runtime's RollbackManager).
      return ok({ modifiedFiles: [file], changes });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Apply patch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ─── rollback-changes ───
// Rolls back tracked file changes using the SHARED RollbackManager from the
// runtime (passed via context). v2.0: the tool no longer creates a fresh
// RollbackManager — it uses the one owned by the runtime, which has the
// actual tracked changes from apply-patch executions.
export const rollbackChangesTool: Tool = {
  manifest: writeManifest("rollback-changes", "Rollback file changes", ["rollback-changes"], {
    cost: "medium",
    estimatedTimeMs: 500,
    timeout: 10000,
    inputSchema: { type: "object", properties: {}, required: [] },
  }),
  async execute(_params, ctx: AgentContext) {
    try {
      // Access the runtime's RollbackManager via a shared registry.
      // The execution engine registers its rollback manager per-analysisId
      // so tools can access it without changing the AgentContext contract.
      const { getSharedRollbackManager } = await import("../../runtime/shared-state");
      const rollback = getSharedRollbackManager(ctx.analysisId);
      if (!rollback) {
        return ok({ rolledBack: true, changesReverted: 0, note: "No rollback manager registered for this analysis" });
      }

      const changeCount = rollback.count();
      const result = await rollback.rollback();
      if (!result.ok) return result;

      return ok({ rolledBack: true, changesReverted: changeCount });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Rollback failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ─── run-lint ───
// Runs ESLint via child_process.
export const runLintTool: Tool = {
  manifest: writeManifest("run-lint", "Run ESLint on the project", ["run-lint"], {
    cost: "medium",
    estimatedTimeMs: 10000,
    timeout: 30000,
    permission: "allow",
  }),
  async execute(_params, _ctx: AgentContext) {
    try {
      const { execSync } = await import("child_process");
      const output = execSync("npx eslint . --format json 2>&1 || true", {
        encoding: "utf-8",
        timeout: 25000,
        maxBuffer: 1024 * 1024,
      });

      // Parse ESLint JSON output
      let results: any[] = [];
      try {
        results = JSON.parse(output);
      } catch {
        return ok({ exitCode: 0, output: output.slice(0, 500), errorCount: 0, warningCount: 0 });
      }

      const errorCount = results.reduce((sum: number, r: any) => sum + (r.errorCount || 0), 0);
      const warningCount = results.reduce((sum: number, r: any) => sum + (r.warningCount || 0), 0);

      return ok({
        exitCode: errorCount > 0 ? 1 : 0,
        errorCount,
        warningCount,
        output: output.slice(0, 2000),
      });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Lint failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ─── run-tests ───
// Runs test suite via child_process.
export const runTestsTool: Tool = {
  manifest: writeManifest("run-tests", "Run test suite", ["run-tests"], {
    cost: "expensive",
    estimatedTimeMs: 30000,
    timeout: 60000,
    permission: "allow",
  }),
  async execute(_params, _ctx: AgentContext) {
    try {
      const { execSync } = await import("child_process");
      const output = execSync("npx jest --json --silent 2>&1 || true", {
        encoding: "utf-8",
        timeout: 55000,
        maxBuffer: 2 * 1024 * 1024,
      });

      // Parse Jest JSON output
      let passed = 0;
      let failed = 0;
      let total = 0;
      try {
        const lines = output.split("\n");
        // Find the JSON line (Jest --json outputs JSON at the end)
        for (const line of lines.reverse()) {
          if (line.startsWith("{")) {
            const data = JSON.parse(line);
            passed = data.numPassedTests || 0;
            failed = data.numFailedTests || 0;
            total = data.numTotalTests || 0;
            break;
          }
        }
      } catch {}

      return ok({
        exitCode: failed > 0 ? 1 : 0,
        passed,
        failed,
        total,
        output: output.slice(0, 2000),
      });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Tests failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ─── git-commit ───
// Commits changes via GitService.commitAsync.
export const gitCommitTool: Tool = {
  manifest: dangerousManifest("git-commit", "Commit changes to git", ["git-commit"], {
    estimatedTimeMs: 2000,
    timeout: 10000,
    inputSchema: { type: "object", properties: { message: { type: "string" }, files: { type: "array" } }, required: ["message"] },
  }),
  async execute(params, _ctx: AgentContext) {
    const message = requireParam(params, "message");
    if (!message) return err("TOOL_INVALID_PARAMS", "Missing required param: message");

    try {
      const { GitServiceImpl } = await import("../../services/git-service");
      const git = new GitServiceImpl();

      const files = Array.isArray(params.files) ? params.files as string[] : undefined;
      const result = await git.commitAsync(message, files);
      if (!result.ok) return result;

      return ok({ sha: result.value, message });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git commit failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ─── git-push ───
// Pushes commits via GitService.pushAsync.
export const gitPushTool: Tool = {
  manifest: dangerousManifest("git-push", "Push commits to remote", ["git-push"], {
    estimatedTimeMs: 5000,
    timeout: 30000,
  }),
  async execute(_params, _ctx: AgentContext) {
    try {
      const { GitServiceImpl } = await import("../../services/git-service");
      const git = new GitServiceImpl();
      const result = await git.pushAsync();
      if (!result.ok) return result;

      return ok({ pushed: true });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git push failed: ${e instanceof Error ? e.message : String(e)}`);
    }
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
