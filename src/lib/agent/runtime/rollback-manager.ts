// CodeInsight AI — Rollback Manager (Layer 7)
// Tracks file changes during plan execution and supports rollback on failure.
// Uses RepoService async methods for real file operations.

import type { ChangeRecord, Result, AgentError } from "../contracts";

export class RollbackManager {
  private changes: ChangeRecord[] = [];
  private fileOps: {
    deleteFile: (p: string) => Promise<void>;
    writeFile: (p: string, c: string) => Promise<void>;
    createFile: (p: string, c: string) => Promise<void>;
    fileExists: (p: string) => Promise<boolean>;
  } | null = null;

  /** Set the file operations backend (called by Runtime setup) */
  setFileOps(ops: {
    deleteFile: (p: string) => Promise<void>;
    writeFile: (p: string, c: string) => Promise<void>;
    createFile: (p: string, c: string) => Promise<void>;
    fileExists: (p: string) => Promise<boolean>;
  }): void {
    this.fileOps = ops;
  }

  /** Track a file change for potential rollback */
  track(change: ChangeRecord): void {
    this.changes.push(change);
  }

  /** Track multiple changes */
  trackAll(changes: ChangeRecord[]): void {
    this.changes.push(...changes);
  }

  /** Get all tracked changes */
  getChanges(): ChangeRecord[] {
    return [...this.changes];
  }

  /**
   * Rollback all tracked changes (in reverse order).
   * For "create" → delete the file.
   * For "update" → restore old content.
   * For "delete" → recreate with old content.
   */
  async rollback(): Promise<Result<void>> {
    if (!this.fileOps) {
      // No file ops backend — can't rollback files, just clear log
      this.changes = [];
      return ok(undefined);
    }

    try {
      const reversed = [...this.changes].reverse();

      for (const change of reversed) {
        switch (change.type) {
          case "create":
            if (await this.fileOps.fileExists(change.file)) {
              await this.fileOps.deleteFile(change.file);
            }
            break;
          case "update":
            if (change.oldContent !== undefined) {
              await this.fileOps.writeFile(change.file, change.oldContent);
            }
            break;
          case "delete":
            if (change.oldContent !== undefined) {
              await this.fileOps.createFile(change.file, change.oldContent);
            }
            break;
        }
      }

      this.changes = [];
      return ok(undefined);
    } catch (e) {
      return err(
        "RUNTIME_ROLLBACK_FAILED",
        `Rollback failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Clear all tracked changes (after successful commit) */
  clear(): void {
    this.changes = [];
  }

  /** Count tracked changes */
  count(): number {
    return this.changes.length;
  }

  /** Check if any changes are tracked */
  hasChanges(): boolean {
    return this.changes.length > 0;
  }
}

// ─── Helpers ───

function ok(value: void): Result<void> {
  return { ok: true, value };
}

function err(code: string, message: string): { ok: false; error: AgentError } {
  return { ok: false, error: { code, message, recoverable: false } };
}
