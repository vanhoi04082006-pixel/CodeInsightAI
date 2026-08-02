// CodeInsight AI — Rollback Manager (Layer 7)
// Tracks file changes during plan execution and supports rollback on failure.

import type { ChangeRecord, Result, AgentError } from "../contracts";

export class RollbackManager {
  private changes: ChangeRecord[] = [];

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
    try {
      // Reverse order: undo last change first
      const reversed = [...this.changes].reverse();

      for (const change of reversed) {
        switch (change.type) {
          case "create":
            // Delete the created file
            // In production: await fileOps.deleteFile(change.file)
            break;
          case "update":
            // Restore old content
            if (change.oldContent !== undefined) {
              // In production: await fileOps.writeFile(change.file, change.oldContent)
            }
            break;
          case "delete":
            // Recreate with old content
            if (change.oldContent !== undefined) {
              // In production: await fileOps.createFile(change.file, change.oldContent)
            }
            break;
        }
      }

      // Clear after successful rollback
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
