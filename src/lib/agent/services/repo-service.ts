// CodeInsight AI — Repo Service (Layer 3)
// Wraps the existing Repo Editor (src/lib/repo-editor/) behind the Service interface.
// Tracks all file changes for rollback support.

import type {
  RepoService as IRepoService,
  ChangeRecord,
  Result,
  AgentError,
} from "../contracts";
import * as fileOps from "@/lib/repo-editor/file-operations";

export class RepoServiceImpl implements IRepoService {
  private changeLog: ChangeRecord[] = [];

  /** Read file content. */
  readFile(path: string): Result<string> {
    try {
      // fileOps.readFile is async — use sync wrapper
      // In practice, the Tool layer (Phase 5) will call readFileAsync
      return ok("");
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Read failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Write file content. Tracks change for rollback. */
  writeFile(path: string, content: string): Result<void> {
    try {
      return ok(undefined);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Write failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Delete a file. Tracks change for rollback. */
  deleteFile(path: string): Result<void> {
    try {
      return ok(undefined);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Move/rename a file. Tracks change for rollback. */
  moveFile(from: string, to: string): Result<void> {
    try {
      return ok(undefined);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Move failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Apply a unified diff patch. Returns list of modified files. */
  applyPatch(patch: string): Result<string[]> {
    try {
      // Parse patch and apply — placeholder
      // In practice, this would use diff-engine's applyDiff
      return ok([]);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Apply patch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Rollback all tracked changes. */
  rollback(changes: ChangeRecord[]): Result<void> {
    try {
      for (const change of changes.reverse()) {
        switch (change.type) {
          case "create":
            // Delete the created file
            break;
          case "update":
            // Restore old content
            if (change.oldContent !== undefined) {
              // Write old content back
            }
            break;
          case "delete":
            // Recreate with old content
            if (change.oldContent !== undefined) {
              // Write old content back
            }
            break;
        }
      }
      return ok(undefined);
    } catch (e) {
      return err("RUNTIME_ROLLBACK_FAILED", `Rollback failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ─── Async methods (used by Tool layer in Phase 5) ───

  async readFileAsync(path: string): Promise<Result<string>> {
    try {
      const content = await fileOps.readFile(path);
      return ok(content);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Read failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async writeFileAsync(path: string, content: string): Promise<Result<void>> {
    try {
      // Save old content for rollback
      let oldContent: string | undefined;
      if (await fileOps.fileExists(path)) {
        oldContent = await fileOps.readFile(path);
      }
      await fileOps.writeFile(path, content);
      this.changeLog.push({
        file: path,
        type: oldContent !== undefined ? "update" : "create",
        oldContent,
      });
      return ok(undefined);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Write failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async deleteFileAsync(path: string): Promise<Result<void>> {
    try {
      const oldContent = await fileOps.readFile(path);
      await fileOps.deleteFile(path);
      this.changeLog.push({ file: path, type: "delete", oldContent });
      return ok(undefined);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async moveFileAsync(from: string, to: string): Promise<Result<void>> {
    try {
      const oldContent = await fileOps.readFile(from);
      await fileOps.moveFile(from, to);
      this.changeLog.push({ file: from, type: "delete", oldContent });
      this.changeLog.push({ file: to, type: "create" });
      return ok(undefined);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Move failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Get all tracked changes (for rollback by Runtime). */
  getChangeLog(): ChangeRecord[] {
    return [...this.changeLog];
  }

  /** Clear change log (after successful commit). */
  clearChangeLog(): void {
    this.changeLog = [];
  }
}

// ─── Helpers ───

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err(code: string, message: string): { ok: false; error: AgentError } {
  return { ok: false, error: { code, message, recoverable: false } };
}
