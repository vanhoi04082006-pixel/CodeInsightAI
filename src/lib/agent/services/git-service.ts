// CodeInsight AI — Git Service (Layer 3)
// Wraps the existing Git Intelligence (src/lib/git-intelligence/) behind the Service interface.
// All methods that modify git state require permission checks at the Tool layer (Phase 5).

import type {
  GitService as IGitService,
  GitCommit,
  Result,
  AgentError,
} from "../contracts";
import { gitOps } from "@/lib/git-intelligence/git-operations";

export class GitServiceImpl implements IGitService {
  /** Get git diff (unstaged or staged). */
  diff(filePath?: string): Result<string> {
    try {
      // The existing gitOps.getDiff/getDiffForFile are async, but we wrap them
      // in a synchronous Result for interface compliance. In practice, Tools
      // (Phase 5) will call this via an async wrapper.
      // For now, return a pending result that the caller must resolve.
      // In production, this would use a sync child_process.execSync.
      return ok("");
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git diff failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Commit changes. Returns commit SHA. */
  commit(message: string, files?: string[]): Result<string> {
    try {
      // Synchronous wrapper — actual implementation in Tool layer (Phase 5)
      // which can be async. This is a placeholder that returns success.
      return ok("commit-sha-placeholder");
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git commit failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Push to remote. */
  push(): Result<void> {
    try {
      return ok(undefined);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git push failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Get commit history for a file. */
  history(file: string, limit: number = 20): Result<GitCommit[]> {
    try {
      return ok([]);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git history failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Revert a commit. */
  revert(commitSha: string): Result<void> {
    try {
      return ok(undefined);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git revert failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ─── Async methods (used by Tool layer in Phase 5) ───
  // These wrap the actual async gitOps methods. The Tool layer will call
  // these instead of the sync Result-returning methods above.

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
      // gitOps doesn't have a direct history method — use log
      const status = await gitOps.getStatus();
      // Placeholder: would use git log --follow file --format=...
      return ok([]);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Git history failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async revertAsync(commitSha: string): Promise<Result<void>> {
    try {
      // gitOps doesn't have revert — would need to add
      // For now, this is a placeholder
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
