// CodeInsight AI — Tool Definitions: Additional tools (Layer 4)
// 6 tools for capabilities that were missing: git-diff, git-history, git-revert,
// run-script, ai-insight, ai-chat.

import type { Tool, Result, AgentContext } from "../../contracts";
import { readOnlyManifest, writeManifest } from "../manifest";

function ok<T>(value: T): Result<T> { return { ok: true, value }; }
function err(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message, recoverable: false } };
}

function requireParam(params: Record<string, unknown>, name: string): string | null {
  const val = params[name];
  if (typeof val !== "string" || !val) return null;
  return val;
}

// ─── git-diff ───
export const gitDiffTool: Tool = {
  manifest: readOnlyManifest("git-diff", "Get git diff (unstaged or for a specific file)", ["git-diff"], {
    estimatedTimeMs: 2000,
    timeout: 10000,
    inputSchema: { type: "object", properties: { file: { type: "string" } }, required: [] },
  }),
  async execute(params, _ctx: AgentContext) {
    try {
      const { GitServiceImpl } = await import("../../services/git-service");
      const git = new GitServiceImpl();
      const file = requireParam(params, "file");
      const result = await git.diffAsync(file || undefined);
      if (!result.ok) return result;
      return ok({ diff: result.value });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git diff failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ─── git-history ───
export const gitHistoryTool: Tool = {
  manifest: readOnlyManifest("git-history", "Get commit history for a file", ["git-history"], {
    estimatedTimeMs: 2000,
    timeout: 10000,
    inputSchema: { type: "object", properties: { file: { type: "string" }, limit: { type: "number" } }, required: ["file"] },
  }),
  async execute(params, _ctx: AgentContext) {
    try {
      const { GitServiceImpl } = await import("../../services/git-service");
      const git = new GitServiceImpl();
      const file = requireParam(params, "file");
      if (!file) return err("TOOL_INVALID_PARAMS", "Missing required param: file");
      const limit = typeof params.limit === "number" ? params.limit : 20;
      const result = await git.historyAsync(file, limit);
      if (!result.ok) return result;
      return ok({ commits: result.value });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git history failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ─── git-revert ───
export const gitRevertTool: Tool = {
  manifest: writeManifest("git-revert", "Revert a git commit", ["git-revert"], {
    cost: "medium",
    estimatedTimeMs: 3000,
    timeout: 15000,
    inputSchema: { type: "object", properties: { commitSha: { type: "string" } }, required: ["commitSha"] },
  }),
  async execute(params, _ctx: AgentContext) {
    try {
      const { GitServiceImpl } = await import("../../services/git-service");
      const git = new GitServiceImpl();
      const commitSha = requireParam(params, "commitSha");
      if (!commitSha) return err("TOOL_INVALID_PARAMS", "Missing required param: commitSha");
      const result = await git.revertAsync(commitSha);
      if (!result.ok) return result;
      return ok({ reverted: true, commitSha });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git revert failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ─── run-script ───
// v2.2 security fix (C4): route through commandRunner (enforces allowlist/denylist).
// v2.0 used execSync directly, bypassing the terminal permission-system.
export const runScriptTool: Tool = {
  manifest: writeManifest("run-script", "Run a shell script or command", ["run-script"], {
    cost: "medium",
    estimatedTimeMs: 5000,
    timeout: 30000,
    permission: "prompt",
    inputSchema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
  }),
  async execute(params, _ctx: AgentContext) {
    const command = requireParam(params, "command");
    if (!command) return err("TOOL_INVALID_PARAMS", "Missing required param: command");

    try {
      // v2.2: Use commandRunner which enforces the terminal permission-system
      // (allowlist/denylist). Commands on the denylist (e.g. "rm -rf /") are
      // blocked. Commands not on either list trigger onPrompt.
      const { commandRunner } = await import("@/lib/terminal/command-runner");
      const result = await commandRunner.runCommand(command, {
        cwd: process.cwd(),
        timeout: 25000,
        recordHistory: true,
        onPrompt: async () => true, // the agent-level permission gate already approved
      });

      if (result.exitCode !== 0) {
        const output = (result.stdout || "") + (result.stderr || "");
        return err("TOOL_EXECUTION_FAILED", `Command exited with code ${result.exitCode}: ${output.slice(0, 1000)}`);
      }
      return ok({ exitCode: 0, output: (result.stdout || "").slice(0, 2000) });
    } catch (e: any) {
      // commandRunner throws if the command is denied by the denylist
      return err("TOOL_EXECUTION_FAILED", `Command execution denied or failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ─── ai-insight ───
export const aiInsightTool: Tool = {
  manifest: readOnlyManifest("ai-insight", "Get or generate AI insight for the project", ["ai-insight"], {
    cost: "expensive",
    estimatedTimeMs: 20000,
    timeout: 30000,
    cacheable: false,
    inputSchema: { type: "object", properties: { type: { type: "string" } }, required: ["type"] },
  }),
  async execute(params, ctx: AgentContext) {
    const type = requireParam(params, "type");
    if (!type) return err("TOOL_INVALID_PARAMS", "Missing required param: type");

    try {
      const { AIInsightServiceImpl } = await import("../../services/ai-insight-service");
      const ai = new AIInsightServiceImpl();

      // Try cached insight first
      const cached = ai.getInsight(type, ctx.spm);
      if (cached.ok && cached.value) {
        return ok({ insight: cached.value, cached: true });
      }

      // Generate new insight
      const generated = await ai.generateInsightAsync(type, { spm: ctx.spm });
      if (!generated.ok) return generated;
      return ok({ insight: generated.value, cached: false });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `AI insight failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ─── ai-chat ───
export const aiChatTool: Tool = {
  manifest: readOnlyManifest("ai-chat", "Chat with AI about the repository", ["ai-chat"], {
    cost: "expensive",
    estimatedTimeMs: 15000,
    timeout: 30000,
    cacheable: false,
    streamable: true,
    inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
  }),
  async execute(params, ctx: AgentContext) {
    const message = requireParam(params, "message");
    if (!message) return err("TOOL_INVALID_PARAMS", "Missing required param: message");

    try {
      const { callAI } = await import("@/lib/ai-client");
      const { getPlatformAIConfig } = await import("@/lib/platform-ai");

      const provider = await getPlatformAIConfig();
      if (!provider) {
        return err("TOOL_EXECUTION_FAILED", "No AI provider configured. Set PLATFORM_AI_API_KEY env var or configure a platform AI provider.");
      }

      // Build context from SPM
      const contextStr = `Project: ${ctx.spm.repoOwner}/${ctx.spm.repoName}
Files: ${ctx.spm.metrics.totalFiles}, Lines: ${ctx.spm.metrics.totalLines}
Architecture: ${ctx.spm.architecture.pattern}
Issues: ${ctx.spm.issues.length}
Top issues: ${ctx.spm.issues.slice(0, 5).map(i => `- [${i.severity}] ${i.title} (${i.file})`).join("\n")}`;

      const result = await callAI(
        {
          providerId: provider.providerId,
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
          model: provider.model,
          temperature: 0.7,
          maxTokens: 2000,
          timeout: 25,
        },
        [
          { role: "system", content: `You are a Senior Staff Engineer analyzing a codebase. Respond concisely.\n\n${contextStr}` },
          { role: "user", content: message },
        ],
        { maxTokens: 2000, temperature: 0.7, timeout: 25 },
      );
      return ok({ response: result.content });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `AI chat failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// Export all additional tools
export const additionalTools: Tool[] = [
  gitDiffTool,
  gitHistoryTool,
  gitRevertTool,
  runScriptTool,
  aiInsightTool,
  aiChatTool,
];
