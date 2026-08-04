// CodeInsight AI — Repo Service (Layer 3)
// Wraps the existing Repo Editor (src/lib/repo-editor/) behind the Service interface.
// Tracks all file changes for rollback support.
//
// v2.0: Removed the v1 sync stubs (readFile/writeFile/deleteFile/moveFile/applyPatch/
// rollback all returned ok(""/undefined/[]) — false success). Only the REAL async
// methods remain. The sync methods on the contract interface are now implemented
// to throw "use *Async variant" so callers can't accidentally use stubs.

import type {
  RepoService as IRepoService,
  ChangeRecord,
  Result,
  AgentError,
} from "../contracts";
import * as fileOps from "@/lib/repo-editor/file-operations";
import * as nodePath from "path";

/**
 * Validate that a path is within the project root (prevents path traversal).
 * Resolves the path and checks it starts with the project root.
 * Returns the resolved path on success, or null if the path escapes the root.
 *
 * v2.2 security fix (C1): prevents LLM-controlled paths from writing to
 * arbitrary locations like /etc/passwd, ~/.ssh/authorized_keys, etc.
 */
function validatePathWithinRoot(filePath: string): { ok: true; resolved: string } | { ok: false; reason: string } {
  const root = nodePath.resolve(process.cwd());
  const resolved = nodePath.resolve(filePath);
  // Must be inside root (root + path.sep prefix) or equal to root.
  if (resolved === root || resolved.startsWith(root + nodePath.sep)) {
    return { ok: true, resolved };
  }
  return {
    ok: false,
    reason: `Path "${filePath}" resolves to "${resolved}" which is outside project root "${root}"`,
  };
}

export class RepoServiceImpl implements IRepoService {
  private changeLog: ChangeRecord[] = [];

  // ─── Sync methods (contract compliance — all throw, use *Async variants) ───
  // v2.0: These are kept for interface compliance but throw to prevent the v1
  // bug where callers got false-success stubs. Use the *Async variants instead.

  readFile(path: string): Result<string> {
    return err("TOOL_EXECUTION_FAILED", `Sync readFile is not supported — use readFileAsync(). Path: ${path}`);
  }

  writeFile(path: string, _content: string): Result<void> {
    return err("TOOL_EXECUTION_FAILED", `Sync writeFile is not supported — use writeFileAsync(). Path: ${path}`);
  }

  deleteFile(path: string): Result<void> {
    return err("TOOL_EXECUTION_FAILED", `Sync deleteFile is not supported — use deleteFileAsync(). Path: ${path}`);
  }

  moveFile(from: string, to: string): Result<void> {
    return err("TOOL_EXECUTION_FAILED", `Sync moveFile is not supported — use moveFileAsync(). From: ${from} To: ${to}`);
  }

  applyPatch(patch: string): Result<string[]> {
    return err("TOOL_EXECUTION_FAILED", `Sync applyPatch is not supported — use writeFileAsync() with the new content. Patch length: ${patch.length}`);
  }

  rollback(changes: ChangeRecord[]): Result<void> {
    return err("TOOL_EXECUTION_FAILED", `Sync rollback is not supported — use the runtime's RollbackManager.rollback() (async). Changes: ${changes.length}`);
  }

  // ─── Async methods (REAL implementations used by the Tool layer) ───
  // v2.2: All async methods validate paths are within project root (C1 fix).

  async readFileAsync(path: string): Promise<Result<string>> {
    const validation = validatePathWithinRoot(path);
    if (!validation.ok) {
      return err("TOOL_INVALID_PARAMS", `Path traversal blocked: ${validation.reason}`);
    }
    try {
      const content = await fileOps.readFile(validation.resolved);
      return ok(content);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Read failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async writeFileAsync(path: string, content: string): Promise<Result<void>> {
    const validation = validatePathWithinRoot(path);
    if (!validation.ok) {
      return err("TOOL_INVALID_PARAMS", `Path traversal blocked: ${validation.reason}`);
    }
    try {
      // Save old content for rollback
      let oldContent: string | undefined;
      if (await fileOps.fileExists(validation.resolved)) {
        oldContent = await fileOps.readFile(validation.resolved);
      }
      await fileOps.writeFile(validation.resolved, content);
      this.changeLog.push({
        file: validation.resolved,
        type: oldContent !== undefined ? "update" : "create",
        oldContent,
      });
      return ok(undefined);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Write failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async deleteFileAsync(path: string): Promise<Result<void>> {
    const validation = validatePathWithinRoot(path);
    if (!validation.ok) {
      return err("TOOL_INVALID_PARAMS", `Path traversal blocked: ${validation.reason}`);
    }
    try {
      const oldContent = await fileOps.readFile(validation.resolved);
      await fileOps.deleteFile(validation.resolved);
      this.changeLog.push({ file: validation.resolved, type: "delete", oldContent });
      return ok(undefined);
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async moveFileAsync(from: string, to: string): Promise<Result<void>> {
    const fromValidation = validatePathWithinRoot(from);
    if (!fromValidation.ok) {
      return err("TOOL_INVALID_PARAMS", `Path traversal blocked (source): ${fromValidation.reason}`);
    }
    const toValidation = validatePathWithinRoot(to);
    if (!toValidation.ok) {
      return err("TOOL_INVALID_PARAMS", `Path traversal blocked (destination): ${toValidation.reason}`);
    }
    try {
      const oldContent = await fileOps.readFile(fromValidation.resolved);
      await fileOps.moveFile(fromValidation.resolved, toValidation.resolved);
      this.changeLog.push({ file: fromValidation.resolved, type: "delete", oldContent });
      this.changeLog.push({ file: toValidation.resolved, type: "create" });
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
