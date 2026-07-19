// CodeInsight AI — Rollback Manager (Phase E)
// Snapshot-and-restore mechanism for mission file state.
//
// Responsibilities:
//   - Take a snapshot of one or more files (their on-disk contents) before
//     a destructive action is attempted.
//   - Restore file contents to a previous snapshot when a fix made things
//     worse (or the AI explicitly requests rollback).
//   - Keep a per-mission LRU list of snapshots (capped at 10).
//   - Coordinate with the existing `changeStack` so manual undo/redo in the
//     UI still reflects rollbacks performed by the executive agent.
//
// Snapshots are stored in-process (module singleton). Files that no longer
// exist at snapshot time are recorded with `content === null` so rollback
// can recreate or delete them as appropriate.

import * as crypto from "crypto";
import { readFile, writeFile, fileExists } from "@/lib/repo-editor/file-operations";
import {
  changeStack,
  type Change,
} from "@/lib/repo-editor/change-history";
import { missionEmitter } from "./event-emitter";
import type { MissionState } from "./types";

// ── Public types ────────────────────────────────────────────────────────────
export interface RollbackSnapshot {
  id: string;
  missionId: string;
  timestamp: number;
  reason: string;
  /** File states at snapshot time. `content === null` means file did not exist. */
  files: { path: string; content: string | null }[];
  /** Mission state at snapshot time (subset — confidence, iteration, etc.). */
  missionState: Partial<MissionState>;
  /** Confidence recorded at snapshot time (for "did we get worse?" checks). */
  confidence: number;
}

// ── Constants ───────────────────────────────────────────────────────────────
const MAX_SNAPSHOTS_PER_MISSION = 10;

// ── RollbackManager class ───────────────────────────────────────────────────
export class RollbackManager {
  private readonly snapshots = new Map<string, RollbackSnapshot[]>();
  private readonly maxPerMission: number;

  constructor(maxPerMission = MAX_SNAPSHOTS_PER_MISSION) {
    this.maxPerMission = maxPerMission;
  }

  /**
   * Take a snapshot of the given files (and current mission state) before a
   * risky action. Returns the snapshotId. Files that do not exist are
   * recorded with `content === null` so rollback can recreate-or-delete them.
   */
  async snapshot(
    missionId: string,
    reason: string,
    files: string[],
    missionState?: Partial<MissionState>,
    confidence = 0,
  ): Promise<string> {
    const id = `snap_${crypto.randomUUID().slice(0, 12)}`;
    const now = Date.now();

    const fileStates: { path: string; content: string | null }[] = [];
    for (const p of files) {
      if (!p || typeof p !== "string") continue;
      try {
        const exists = await fileExists(p);
        if (!exists) {
          fileStates.push({ path: p, content: null });
          continue;
        }
        const content = await readFile(p);
        fileStates.push({ path: p, content });
      } catch {
        // Read failed (permissions, encoding, etc.) — treat as missing.
        fileStates.push({ path: p, content: null });
      }
    }

    const snapshot: RollbackSnapshot = {
      id,
      missionId,
      timestamp: now,
      reason,
      files: fileStates,
      missionState: missionState ?? {},
      confidence,
    };

    const list = this.snapshots.get(missionId) ?? [];
    list.push(snapshot);
    // LRU cap: drop oldest snapshots when over budget.
    while (list.length > this.maxPerMission) {
      list.shift();
    }
    this.snapshots.set(missionId, list);

    missionEmitter.emit({
      type: "agent:acting",
      missionId,
      agent: "rollback",
      action: "snapshot",
      detail: `Snapshot ${id} (${fileStates.length} files): ${reason}`,
      timestamp: now,
    });

    return id;
  }

  /**
   * Roll back to a previous snapshot. Restores file contents on disk and
   * pushes a `Change` for each restored file onto the shared changeStack so
   * the UI's undo/redo history stays coherent. Returns `false` if no
   * snapshot exists (or the requested snapshotId is unknown).
   */
  async rollback(missionId: string, snapshotId?: string): Promise<boolean> {
    const list = this.snapshots.get(missionId);
    if (!list || list.length === 0) return false;

    let snapshot: RollbackSnapshot | undefined;
    if (snapshotId) {
      snapshot = list.find((s) => s.id === snapshotId);
    } else {
      snapshot = list[list.length - 1]; // most recent
    }
    if (!snapshot) return false;

    const now = Date.now();
    let restored = 0;
    let deleted = 0;
    let created = 0;

    for (const f of snapshot.files) {
      // Capture the *current* on-disk state so the changeStack knows the
      // pre-rollback content (this lets a user "redo" the rollback later).
      let currentContent: string | null = null;
      try {
        const exists = await fileExists(f.path);
        currentContent = exists ? await readFile(f.path) : null;
      } catch {
        currentContent = null;
      }

      if (f.content === null) {
        // File did not exist at snapshot time → delete it (if it exists now).
        if (currentContent !== null) {
          try {
            const { deleteFile } = await import("@/lib/repo-editor/file-operations");
            await deleteFile(f.path);
            deleted++;
          } catch (err) {
            missionEmitter.emit({
              type: "error",
              missionId,
              message: `Rollback: failed to delete ${f.path}: ${err instanceof Error ? err.message : String(err)}`,
              recoverable: true,
              timestamp: now,
            });
          }
        }
      } else {
        // Restore the snapshot's content.
        try {
          await writeFile(f.path, f.content);
          if (currentContent === null) {
            created++;
          } else {
            restored++;
          }
        } catch (err) {
          missionEmitter.emit({
            type: "error",
            missionId,
            message: `Rollback: failed to restore ${f.path}: ${err instanceof Error ? err.message : String(err)}`,
            recoverable: true,
            timestamp: now,
          });
        }
      }

      // Push a Change record so the global changeStack stays coherent.
      const change: Change = {
        id: crypto.randomUUID(),
        type: currentContent === null ? "create" : "edit",
        path: f.path,
        oldContent: currentContent ?? undefined,
        newContent: f.content ?? undefined,
        timestamp: now,
      };
      changeStack.push(change);
    }

    // Emit a memory:update with the restored snapshot id so the UI can show
    // "rolled back to snapshot X".
    missionEmitter.emit({
      type: "memory:update",
      missionId,
      key: "rollback",
      value: {
        snapshotId: snapshot.id,
        reason: snapshot.reason,
        filesRestored: restored,
        filesCreated: created,
        filesDeleted: deleted,
      },
      timestamp: now,
    });

    missionEmitter.emit({
      type: "agent:acting",
      missionId,
      agent: "rollback",
      action: "rollback",
      detail: `Rolled back to ${snapshot.id}: ${restored} restored, ${created} created, ${deleted} deleted — ${snapshot.reason}`,
      timestamp: now,
    });

    // Drop snapshots newer than the one we rolled back to (standard undo behavior:
    // once you go back, the "future" snapshots are stale).
    if (snapshotId) {
      const idx = list.findIndex((s) => s.id === snapshotId);
      if (idx >= 0) {
        list.splice(idx + 1);
        this.snapshots.set(missionId, list);
      }
    }

    return true;
  }

  /** List all snapshots for a mission (oldest first). */
  listSnapshots(missionId: string): RollbackSnapshot[] {
    return [...(this.snapshots.get(missionId) ?? [])];
  }

  /** Drop all snapshots for a mission (call when the mission completes). */
  clear(missionId: string): void {
    this.snapshots.delete(missionId);
  }

  /** True when at least one snapshot exists for the mission. */
  canRollback(missionId: string): boolean {
    return (this.snapshots.get(missionId)?.length ?? 0) > 0;
  }

  /** Return the most recent snapshot (or `undefined` if none). */
  latestSnapshot(missionId: string): RollbackSnapshot | undefined {
    const list = this.snapshots.get(missionId);
    if (!list || list.length === 0) return undefined;
    return list[list.length - 1];
  }
}

// ── Singleton convenience ───────────────────────────────────────────────────
export const rollbackManager = new RollbackManager();
