// CodeInsight AI — Repository Editor: Change History
// LIFO stack of edits with undo / redo support. Used by agents to roll back
// file mutations they performed during a task.

import * as crypto from "crypto";
import { readFile } from "./file-operations";

export type ChangeType = "create" | "edit" | "delete" | "rename" | "move";

export interface Change {
  id: string;
  type: ChangeType;
  /** Path the change applies to (destination path for rename/move). */
  path: string;
  /** Previous content (for edit / delete). */
  oldContent?: string;
  /** New content (for create / edit). */
  newContent?: string;
  /** Original path (for rename / move). */
  oldPath?: string;
  timestamp: number;
}

/**
 * A LIFO stack of Changes with undo / redo semantics.
 * Pushing a new Change clears the redo stack (standard undo/redo behavior).
 */
export class ChangeStack {
  private undoStack: Change[] = [];
  private redoStack: Change[] = [];

  push(change: Change): void {
    this.undoStack.push(change);
    this.redoStack = [];
  }

  undo(): Change | null {
    const change = this.undoStack.pop();
    if (!change) return null;
    this.redoStack.push(change);
    return change;
  }

  redo(): Change | null {
    const change = this.redoStack.pop();
    if (!change) return null;
    this.undoStack.push(change);
    return change;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Return a snapshot of all applied (undo-able) changes, oldest first. */
  getAll(): Change[] {
    return [...this.undoStack];
  }

  /** Return the most recent N changes. */
  getRecent(count: number): Change[] {
    return this.undoStack.slice(-count);
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  get size(): number {
    return this.undoStack.length;
  }
}

/** Singleton change stack used across the application. */
export const changeStack = new ChangeStack();

/**
 * Read the current on-disk content of `filePath` and return a Change object
 * representing a snapshot (type: "edit"). Useful for capturing the "before"
 * state before applying a transformation.
 */
export async function takeSnapshot(filePath: string): Promise<Change> {
  let content = "";
  try {
    content = await readFile(filePath);
  } catch {
    content = "";
  }
  return {
    id: crypto.randomUUID(),
    type: "edit",
    path: filePath,
    oldContent: content,
    timestamp: Date.now(),
  };
}
