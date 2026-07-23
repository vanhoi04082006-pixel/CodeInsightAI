// CodeInsight AI — AI Terminal: Command History
// Caps the in-memory history of executed commands at 200 entries.

export interface CommandHistoryEntry {
  id: string;
  command: string;
  cwd: string;
  exitCode: number;
  durationMs: number;
  timestamp: number;
}

const DEFAULT_MAX = 200;

/**
 * Bounded in-memory history of executed commands.
 * Searchable by substring; most-recent-first iteration supported.
 */
export class CommandHistory {
  private entries: CommandHistoryEntry[] = [];
  private readonly max: number;

  constructor(max: number = DEFAULT_MAX) {
    this.max = max;
  }

  /** Append a new entry, evicting the oldest if over capacity. */
  add(entry: CommandHistoryEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.max) {
      this.entries.splice(0, this.entries.length - this.max);
    }
  }

  /** Return a copy of all entries (oldest → newest). */
  getAll(): CommandHistoryEntry[] {
    return [...this.entries];
  }

  /** Return the N most-recent entries (newest last). */
  getRecent(count: number = 20): CommandHistoryEntry[] {
    return this.entries.slice(-count);
  }

  /** Substring search over the command field. */
  search(query: string): CommandHistoryEntry[] {
    const q = query.toLowerCase();
    return this.entries.filter((e) => e.command.toLowerCase().includes(q));
  }

  /** Filter by exit code (e.g. 0 for successful commands). */
  filterByExitCode(code: number): CommandHistoryEntry[] {
    return this.entries.filter((e) => e.exitCode === code);
  }

  /** Clear all history. */
  clear(): void {
    this.entries = [];
  }

  /** Current number of stored entries. */
  get size(): number {
    return this.entries.length;
  }
}

/** Singleton command history used by the command runner. */
export const commandHistory = new CommandHistory();
