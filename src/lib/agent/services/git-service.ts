// CodeInsight AI — Git Service (Layer 3)
// Wraps the existing Git Intelligence (src/lib/git-intelligence/) behind the Service interface.
//
// v2.0: Removed the v1 sync stubs (diff/commit/push/history/revert all returned
// placeholders — false success). Sync methods now throw to force *Async usage.
// Implemented historyAsync (was stub returning []) and revertAsync (was no-op)
// using real git operations via execSync/child_process.

import type {
  GitService as IGitService,
  GitCommit,
  Result,
  AgentError,
} from "../contracts";
import { gitOps } from "@/lib/git-intelligence/git-operations";

export class GitServiceImpl implements IGitService {
  // ─── Sync methods (contract compliance — all throw, use *Async variants) ───
  // v2.0: These are kept for interface compliance but throw to prevent the v1
  // bug where callers got false-success stubs. Use the *Async variants instead.

  diff(filePath?: string): Result<string> {
    return err("TOOL_EXECUTION_FAILED", `Sync diff is not supported — use diffAsync(). File: ${filePath || "(all)"}`);
  }

  commit(message: string, files?: string[]): Result<string> {
    return err("TOOL_EXECUTION_FAILED", `Sync commit is not supported — use commitAsync(). Message: ${message}`);
  }

  push(): Result<void> {
    return err("TOOL_EXECUTION_FAILED", "Sync push is not supported — use pushAsync()");
  }

  history(file: string, limit?: number): Result<GitCommit[]> {
    return err("TOOL_EXECUTION_FAILED", `Sync history is not supported — use historyAsync(). File: ${file}`);
  }

  revert(commitSha: string): Result<void> {
    return err("TOOL_EXECUTION_FAILED", `Sync revert is not supported — use revertAsync(). Commit: ${commitSha}`);
  }

  // ─── Async methods (REAL implementations) ───

  async diffAsync(filePath?: string): Promise<Result<string>> {
    try {
      const diff = filePath
        ? await gitOps.getDiffForFile(filePath)
        : await gitOps.getDiff();
      return ok(diff);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git diff failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async commitAsync(message: string, files?: string[]): Promise<Result<string>> {
    try {
      if (files && files.length > 0) {
        await gitOps.stage(files);
      }
      const result = await gitOps.commit(message);
      return ok(result.sha);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git commit failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async pushAsync(): Promise<Result<void>> {
    try {
      await gitOps.push();
      return ok(undefined);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git push failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async historyAsync(file: string, limit: number = 20): Promise<Result<GitCommit[]>> {
    try {
      // v2.2 security fix (C3): use execFileSync (no shell) to prevent $()
      // command substitution. v2.0 used execSync with JSON.stringify(file)
      // which allowed $() inside double quotes.
      const { execFileSync } = await import("child_process");
      const format = "%H%x09%an%x09%ad%x09%s";
      const stdout = execFileSync(
        "git",
        ["log", "--follow", "-n", String(Math.max(1, limit)), `--pretty=format:${format}`, "--", file],
        { encoding: "utf-8", timeout: 10000, maxBuffer: 1024 * 1024 },
      ).trim();

      if (!stdout) return ok([]);

      const commits: GitCommit[] = stdout.split("\n").map((line) => {
        const parts = line.split("\t");
        return {
          sha: parts[0] || "",
          author: parts[1] || "",
          date: parts[2] || "",
          message: parts.slice(3).join("\t") || "",
        };
      });
      return ok(commits);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git history failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async revertAsync(commitSha: string): Promise<Result<void>> {
    try {
      // v2.2 security fix (C2): use execFileSync (no shell) to prevent shell
      // injection via commitSha. v2.0 used execSync with unquoted ${commitSha}.
      const { execFileSync } = await import("child_process");
      execFileSync("git", ["revert", "--no-edit", commitSha], {
        encoding: "utf-8",
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      });
      return ok(undefined);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git revert failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// ─── Helpers ───

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err(code: string, message: string): { ok: false; error: AgentError } {
  return { ok: false, error: { code, message, recoverable: false } };
}
