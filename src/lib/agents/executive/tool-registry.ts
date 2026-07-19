// CodeInsight AI — Executive Tool Registry
// Phase A: Catalog of tools the Executive Agent can invoke dynamically.
//
// Each tool has:
//   - a schema (name, description, parameters, category) for the AI prompt
//   - an `execute` function bound at runtime via the ToolContext
//
// Tools delegate to existing infrastructure:
//   - read_file / list_files / edit_file  → @/lib/repo-editor/file-operations
//   - run_command                          → @/lib/terminal/command-runner
//   - git_status / git_diff                → @/lib/git-intelligence/git-operations
//   - search_code                          → ripgrep via commandRunner
//   - invoke_agent                         → @/lib/agents/agent-registry (reuses the 11 agents)
//   - analyze_ast                          → regex-based lightweight AST extractor
//   - web_search                           → stub for now (returns guidance)
//
// `executeTool()` returns a `ToolCallResult` (success, output, error, durationMs).

import * as path from "path";
import { readFile, writeFile, listFiles, fileExists } from "@/lib/repo-editor/file-operations";
import { commandRunner } from "@/lib/terminal/command-runner";
import { gitOps } from "@/lib/git-intelligence/git-operations";
import { agentRegistry } from "@/lib/agents/agent-registry";
import { taskQueue } from "@/lib/agents/task-queue";
import type { AIProviderConfig } from "@/lib/agents/ai-client";
import type { AgentId, Task, TaskKind, TaskResult } from "@/lib/agents/types";
import { missionEmitter } from "./event-emitter";
import { debateOrchestrator } from "./debate";
import { detectTopic } from "./consensus";
import type { ToolCallResult, ToolDefinition } from "./types";

// ── Tool execution context ─────────────────────────────────────────────────
export interface ToolContext {
  missionId: string;
  cwd: string;
  signal: AbortSignal;
  /** Emit a terminal output chunk (used by run_command, git_status, etc.). */
  emitTerminal: (stream: "stdout" | "stderr", data: string) => void;
  /** Emit a file-change event when a write tool modifies the working tree. */
  emitFileChange: (
    p: string,
    action: "modified" | "added" | "deleted",
    additions: number,
    deletions: number,
  ) => void;
  /** Optional AI provider — required by AI-driven tools like `debate`.
   *  When absent, those tools degrade gracefully (debate returns null). */
  provider?: AIProviderConfig;
}

// ── Type guards for safe argument extraction ────────────────────────────────
function asString(value: unknown, field: string, required = true): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) {
    if (required) throw new Error(`Missing required parameter "${field}"`);
    return "";
  }
  throw new Error(`Parameter "${field}" must be a string, got ${typeof value}`);
}

function asNumber(value: unknown, field: string, defaultValue?: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === undefined || value === null) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required parameter "${field}"`);
  }
  throw new Error(`Parameter "${field}" must be a number, got ${typeof value}`);
}

function asBoolean(value: unknown, field: string, defaultValue = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null) return defaultValue;
  throw new Error(`Parameter "${field}" must be a boolean, got ${typeof value}`);
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (value === undefined || value === null) return {};
  throw new Error(`Parameter "${field}" must be an object, got ${typeof value}`);
}

// ── Helper: resolve a path argument relative to cwd ────────────────────────
function resolvePath(cwd: string, p: string): string {
  if (path.isAbsolute(p)) return p;
  return path.resolve(cwd, p);
}

// ── Tool definitions (schema) ──────────────────────────────────────────────
export const TOOL_CATALOG: ToolDefinition[] = [
  {
    name: "read_file",
    description:
      "Read the UTF-8 contents of a file from the working repository. Use this to inspect source files, configs, or logs.",
    parameters: {
      path: {
        type: "string",
        description: "Path to the file (absolute or relative to cwd).",
        required: true,
      },
      maxBytes: {
        type: "number",
        description: "Maximum bytes to return (default 100_000).",
      },
    },
    category: "read",
  },
  {
    name: "list_files",
    description:
      "Recursively list files in a directory. Skips node_modules, .git, dist, build, etc.",
    parameters: {
      dir: {
        type: "string",
        description: "Directory to list (default: cwd).",
      },
      pattern: {
        type: "string",
        description: "Optional glob pattern, e.g. \"**/*.ts\".",
      },
    },
    category: "read",
  },
  {
    name: "search_code",
    description:
      "Search file contents using ripgrep. Returns matching lines with file:line:content.",
    parameters: {
      pattern: {
        type: "string",
        description: "Regex pattern to search for.",
        required: true,
      },
      glob: {
        type: "string",
        description: "File glob filter, e.g. \"*.ts\".",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of matches (default 50).",
      },
    },
    category: "search",
  },
  {
    name: "run_command",
    description:
      "Run a shell command in the working directory. Use for build/test/lint/git operations. Permission-checked.",
    parameters: {
      command: {
        type: "string",
        description: "Shell command to execute.",
        required: true,
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default 30000).",
      },
    },
    category: "execute",
  },
  {
    name: "git_status",
    description: "Get git status (branch, staged/unstaged/untracked files).",
    parameters: {},
    category: "execute",
  },
  {
    name: "git_diff",
    description: "Get the git diff (staged or unstaged).",
    parameters: {
      staged: {
        type: "boolean",
        description: "If true, return the staged diff (--staged).",
      },
      path: {
        type: "string",
        description: "Optional file path to limit the diff to.",
      },
    },
    category: "read",
  },
  {
    name: "edit_file",
    description:
      "Write content to a file (creates parent directories). Use for fixes, refactors, docs.",
    parameters: {
      path: {
        type: "string",
        description: "Path to the file to write.",
        required: true,
      },
      content: {
        type: "string",
        description: "Full file content to write.",
        required: true,
      },
    },
    category: "write",
  },
  {
    name: "web_search",
    description:
      "Search the web for up-to-date information (docs, API references, error messages). Stub in Phase A.",
    parameters: {
      query: {
        type: "string",
        description: "Search query.",
        required: true,
      },
      maxResults: {
        type: "number",
        description: "Maximum results (default 5).",
      },
    },
    category: "search",
  },
  {
    name: "analyze_ast",
    description:
      "Lightweight AST analysis: extract imports, exports, and function declarations from a source file.",
    parameters: {
      path: {
        type: "string",
        description: "Path to the source file.",
        required: true,
      },
    },
    category: "analyze",
  },
  {
    name: "invoke_agent",
    description:
      "Invoke a specialist agent (planner, code-reviewer, bug-fixer, refactoring-agent, documentation-agent, test-agent, security-agent, performance-agent, devops-agent, repository-analyst). Reuses the existing 11-agent system.",
    parameters: {
      agentId: {
        type: "string",
        description: "ID of the agent to invoke (e.g. \"code-reviewer\").",
        required: true,
      },
      taskKind: {
        type: "string",
        description:
          "Task kind to dispatch (e.g. \"review\", \"fix-bug\", \"refactor\").",
        required: true,
      },
      title: {
        type: "string",
        description: "Title for the task.",
      },
      description: {
        type: "string",
        description: "Description of what the agent should do.",
      },
      input: {
        type: "object",
        description: "Task input object passed to the agent.",
      },
    },
    category: "execute",
  },
  {
    name: "debate",
    description:
      "Trigger a structured multi-agent DEBATE on a controversial question. Each participant submits a proposal, reviews others' proposals, votes (support/oppose/neutral) with confidence, and the Executive makes a final call. Use this ONLY when you're genuinely uncertain or when specialist agents disagree — debates cost ~10 AI calls each. Capped at 5 per mission.",
    parameters: {
      question: {
        type: "string",
        description:
          "The specific question to debate (e.g. \"Should we use eval or Function constructor for dynamic code parsing?\").",
        required: true,
      },
      participants: {
        type: "object",
        description:
          "Array of agent IDs to participate (3-5 recommended). The Executive is always included. Example: [\"security-agent\", \"performance-agent\", \"code-reviewer\"].",
      },
    },
    category: "analyze",
  },
];

// ── Format the catalog for the AI prompt ────────────────────────────────────
export function formatToolsForAI(): string {
  return TOOL_CATALOG.map((t) => {
    const params = Object.entries(t.parameters)
      .map(([name, schema]) => {
        const req = schema.required ? " (required)" : "";
        return `    - ${name} (${schema.type})${req}: ${schema.description}`;
      })
      .join("\n");
    return `### ${t.name} [${t.category}]\n${t.description}\nParameters:\n${params || "    (none)"}`;
  }).join("\n\n");
}

// ── Tool implementations ────────────────────────────────────────────────────
async function tool_read_file(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  try {
    const p = asString(args.path, "path");
    const maxBytes = asNumber(args.maxBytes, "maxBytes", 100_000);
    const resolved = resolvePath(ctx.cwd, p);
    const exists = await fileExists(resolved);
    if (!exists) {
      return {
        success: false,
        output: null,
        error: `File not found: ${resolved}`,
        durationMs: Date.now() - start,
      };
    }
    const content = await readFile(resolved);
    const truncated =
      content.length > maxBytes
        ? content.slice(0, maxBytes) + `\n... (truncated, ${content.length - maxBytes} bytes omitted)`
        : content;
    return {
      success: true,
      output: { path: resolved, content: truncated, size: content.length },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      output: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function tool_list_files(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  try {
    const dir = asString(args.dir, "dir", false) || ctx.cwd;
    const pattern = asString(args.pattern, "pattern", false) || undefined;
    const resolved = resolvePath(ctx.cwd, dir);
    const files = await listFiles(resolved, pattern);
    // Cap output to avoid blowing up the AI context.
    const MAX = 500;
    const trimmed = files.slice(0, MAX);
    return {
      success: true,
      output: {
        dir: resolved,
        count: files.length,
        files: trimmed,
        truncated: files.length > MAX,
      },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      output: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function tool_search_code(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  try {
    const pattern = asString(args.pattern, "pattern");
    const glob = asString(args.glob, "glob", false) || undefined;
    const maxResults = asNumber(args.maxResults, "maxResults", 50);
    // Use ripgrep via commandRunner — it's pre-installed in the sandbox.
    // The pattern is single-quoted; embedded single quotes are escaped.
    const safePattern = pattern.replace(/'/g, `'\\''`);
    let cmd = `rg -n --no-heading --max-count ${Math.max(1, maxResults)}`;
    if (glob) {
      const safeGlob = glob.replace(/'/g, `'\\''`);
      cmd += ` -g '${safeGlob}'`;
    }
    cmd += ` '${safePattern}' .`;
    const result = await commandRunner.runCommand(cmd, {
      cwd: ctx.cwd,
      timeout: 30_000,
      signal: ctx.signal,
      recordHistory: false,
      onPrompt: async () => true, // rg is safe
    });
    if (result.stdout) {
      ctx.emitTerminal("stdout", result.stdout);
    }
    if (result.stderr) {
      ctx.emitTerminal("stderr", result.stderr);
    }
    const lines = result.stdout
      .split("\n")
      .filter((l) => l.length > 0)
      .slice(0, maxResults);
    return {
      success: result.exitCode === 0 || result.exitCode === 1, // rg returns 1 when no matches
      output: {
        pattern,
        glob,
        matches: lines,
        count: lines.length,
        exitCode: result.exitCode,
      },
      error: result.exitCode > 1 ? result.stderr : undefined,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      output: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function tool_run_command(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  try {
    const command = asString(args.command, "command");
    const timeout = asNumber(args.timeout, "timeout", 30_000);
    const result = await commandRunner.runCommand(command, {
      cwd: ctx.cwd,
      timeout,
      signal: ctx.signal,
      onStdout: (data) => ctx.emitTerminal("stdout", data),
      onStderr: (data) => ctx.emitTerminal("stderr", data),
      onPrompt: async () => true, // Executive agent operates with elevated trust
    });
    const success = result.exitCode === 0;
    const stdout = result.stdout.length > 50_000
      ? result.stdout.slice(0, 50_000) + "\n... (truncated)"
      : result.stdout;
    return {
      success,
      output: {
        command: result.command,
        stdout,
        stderr: result.stderr.slice(0, 20_000),
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        cancelled: result.cancelled,
      },
      error: success ? undefined : `Exit code ${result.exitCode}: ${result.stderr.slice(0, 500)}`,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      output: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function tool_git_status(
  _args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  try {
    const status = await gitOps.getStatus(ctx.cwd);
    return {
      success: true,
      output: status,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      output: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function tool_git_diff(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  try {
    const staged = asBoolean(args.staged, "staged", false);
    const filePath = asString(args.path, "path", false);
    let diff: string;
    if (filePath) {
      diff = await gitOps.getDiffForFile(resolvePath(ctx.cwd, filePath), ctx.cwd);
    } else {
      diff = await gitOps.getDiff(ctx.cwd, staged);
    }
    const trimmed = diff.length > 50_000 ? diff.slice(0, 50_000) + "\n... (truncated)" : diff;
    return {
      success: true,
      output: { diff: trimmed, length: diff.length },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      output: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function tool_edit_file(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  try {
    const p = asString(args.path, "path");
    const content = asString(args.content, "content");
    const resolved = resolvePath(ctx.cwd, p);
    const existed = await fileExists(resolved);
    const prevContent = existed ? await readFile(resolved) : "";
    await writeFile(resolved, content);
    // Compute simple line-based additions/deletions for the file:change event.
    const prevLines = prevContent.split("\n");
    const nextLines = content.split("\n");
    const additions = Math.max(0, nextLines.length - prevLines.length);
    const deletions = Math.max(0, prevLines.length - nextLines.length);
    ctx.emitFileChange(
      resolved,
      existed ? "modified" : "added",
      additions,
      deletions,
    );
    return {
      success: true,
      output: {
        path: resolved,
        action: existed ? "modified" : "added",
        bytes: content.length,
      },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      output: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function tool_web_search(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  const query = asString(args.query, "query");
  // Stub: in Phase B this will delegate to the web-search skill.
  return {
    success: true,
    output: {
      query,
      results: [],
      note: "web_search is a stub in Phase A. Wire to the web-search skill in Phase B.",
    },
    durationMs: Date.now() - start,
  };
}

async function tool_analyze_ast(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  try {
    const p = asString(args.path, "path");
    const resolved = resolvePath(ctx.cwd, p);
    const content = await readFile(resolved);
    const imports: string[] = [];
    const exports: string[] = [];
    const functions: string[] = [];

    // Lightweight regex extraction — handles TS/JS/JSX/TSX. For deeper
    // analysis, the bug-fixer / refactoring-agent should be invoked.
    const importRe = /(?:import|require)\s*(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*(?:,?\s*\{[^}]*\})?\s*(?:from\s+)?['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content)) !== null) {
      imports.push(m[1]);
    }
    const exportRe = /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g;
    while ((m = exportRe.exec(content)) !== null) {
      exports.push(m[1]);
    }
    const funcRe =
      /(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\()/g;
    while ((m = funcRe.exec(content)) !== null) {
      const name = m[1] || m[2];
      if (name) functions.push(name);
    }
    return {
      success: true,
      output: {
        path: resolved,
        imports: Array.from(new Set(imports)),
        exports: Array.from(new Set(exports)),
        functions: Array.from(new Set(functions)),
        lines: content.split("\n").length,
      },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      output: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function tool_invoke_agent(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  try {
    const agentId = asString(args.agentId, "agentId");
    const taskKind = asString(args.taskKind, "taskKind") as TaskKind;
    const title = asString(args.title, "title", false) || `Invoke ${agentId}`;
    const description = asString(args.description, "description", false);
    const input = asObject(args.input, "input");

    const entry = agentRegistry.get(agentId as AgentId);
    if (!entry) {
      return {
        success: false,
        output: null,
        error: `Unknown agentId: ${agentId}. Available: ${agentRegistry.listActive().join(", ")}`,
        durationMs: Date.now() - start,
      };
    }

    // Build a Task and run it via the agent directly (bypasses the queue to
    // keep results inline for the ReAct loop's verify step).
    const task: Task = {
      id: `task_invoke_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      kind: taskKind,
      title,
      description,
      priority: "high",
      status: "running",
      assignedAgent: agentId as Task["assignedAgent"],
      dependencies: [],
      input,
      createdAt: Date.now(),
      startedAt: Date.now(),
      attempts: 1,
      maxAttempts: 1,
      timeoutMs: 5 * 60 * 1000,
      progress: 0,
      subtaskIds: [],
    };

    let result: TaskResult;
    try {
      result = await entry.execute(task, ctx.signal, (p, msg) => {
        /* swallow per-agent progress — the executive emits its own events */
        void p;
        void msg;
      });
    } catch (err) {
      result = {
        success: false,
        data: null,
        summary: `Agent ${agentId} threw: ${err instanceof Error ? err.message : String(err)}`,
        artifacts: [],
      };
    }

    return {
      success: result.success,
      output: {
        agentId,
        taskKind,
        taskId: task.id,
        summary: result.summary,
        data: result.data,
        artifacts: result.artifacts,
      },
      error: result.success ? undefined : result.summary,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      output: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

// ── tool_debate: trigger a multi-agent debate on a controversial question ────
async function tool_debate(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  try {
    const question = asString(args.question, "question");
    if (!question) {
      return {
        success: false,
        output: null,
        error: "Missing required parameter 'question'",
        durationMs: Date.now() - start,
      };
    }

    // Participants: from args, or auto-select based on detected topic.
    const rawParticipants = Array.isArray(args.participants)
      ? args.participants.filter((p): p is string => typeof p === "string" && p.length > 0)
      : [];

    // If the caller didn't supply participants, auto-select a sensible group:
    //   - Executive (always)
    //   - The topic expert (if one is detected)
    //   - 1-2 generalist reviewers
    let participants = rawParticipants;
    if (participants.length === 0) {
      const expert = detectTopic(question);
      participants = ["orchestrator"];
      if (expert) participants.push(expert);
      participants.push("code-reviewer");
      if (expert !== "bug-fixer") participants.push("bug-fixer");
    }

    // Look up mission state for the debate context.
    const state = missionEmitter.getState(ctx.missionId);
    const goal = state?.goal ?? "(unknown goal)";
    const memory = state
      ? [
          `knownIssues: ${state.memory.knownIssues.length}`,
          `architectureNotes: ${state.memory.architectureNotes.length}`,
          `attemptedFixes: ${state.memory.attemptedFixes.length}`,
          `keyFiles: ${state.memory.keyFiles.size}`,
          state.memory.knownIssues.slice(-3).join(" | "),
        ]
          .filter((s) => s.trim().length > 0)
          .join("; ")
      : "(no mission state)";
    const recentActions = state
      ? state.toolHistory.slice(-5).map(
          (t) => `${t.tool}(${JSON.stringify(t.args).slice(0, 80)}) → ${t.success ? "OK" : "FAIL"}`,
        )
      : [];

    const result = await debateOrchestrator.debate(
      ctx.missionId,
      question,
      participants,
      { goal, memory, recentActions },
      ctx.provider,
      ctx.signal,
    );

    if (!result) {
      return {
        success: true, // Not an error — debate was skipped (cap reached or no provider)
        output: {
          skipped: true,
          reason:
            "Debate was skipped (no provider configured, debate cap reached, or no participants).",
          question,
        },
        durationMs: Date.now() - start,
      };
    }

    return {
      success: true,
      output: {
        skipped: false,
        question: result.question,
        winner: result.winner
          ? {
              id: result.winner.id,
              agentId: result.winner.agentId,
              proposal: result.winner.proposal,
              reasoning: result.winner.reasoning,
              confidence: result.winner.confidence,
              tradeoffs: result.winner.tradeoffs,
            }
          : null,
        consensusLevel: result.consensusLevel,
        overridden: result.overridden,
        executiveDecision: result.executiveDecision,
        proposalCount: result.proposals.length,
        opinionCount: result.opinions.length,
        proposals: result.proposals.map((p) => ({
          agentId: p.agentId,
          proposal: p.proposal,
          confidence: p.confidence,
        })),
      },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      output: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

// ── Dispatch table ──────────────────────────────────────────────────────────
const IMPLEMENTATIONS: Record<
  string,
  (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolCallResult>
> = {
  read_file: tool_read_file,
  list_files: tool_list_files,
  search_code: tool_search_code,
  run_command: tool_run_command,
  git_status: tool_git_status,
  git_diff: tool_git_diff,
  edit_file: tool_edit_file,
  web_search: tool_web_search,
  analyze_ast: tool_analyze_ast,
  invoke_agent: tool_invoke_agent,
  debate: tool_debate,
};

/**
 * Execute a tool by name. Returns a `ToolCallResult` (never throws —
 * errors are surfaced via the `success`/`error` fields so the ReAct loop
 * can record them and continue reasoning).
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const impl = IMPLEMENTATIONS[name];
  if (!impl) {
    return {
      success: false,
      output: null,
      error: `Unknown tool: ${name}. Available: ${Object.keys(IMPLEMENTATIONS).join(", ")}`,
      durationMs: 0,
    };
  }
  try {
    return await impl(args, ctx);
  } catch (err) {
    return {
      success: false,
      output: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: 0,
    };
  }
}

// Also export the task queue for convenience (used by executive-agent.ts).
export { taskQueue };
