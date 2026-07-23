// CodeInsight AI — Memory Loop
// Phase B: A per-mission memory store that mirrors its entries into the
// structured MissionMemory fields (knownIssues, attemptedFixes,
// architectureNotes, conventions, keyFiles) and also keeps a richer
// in-process index for free-text search and category queries.
//
// Why both?
//   - MissionMemory (in missionEmitter) is the canonical state seen by the UI
//     via SSE and by AI prompts (which read the structured fields directly).
//   - The MemoryLoop index adds: free-form key/value pairs, category tagging,
//     timestamped history, and a `summarize()` helper that builds compact
//     prompt-ready text.
//
// Categories:
//   - "issue"         → mirrored to MissionMemory.knownIssues
//   - "error-pattern" → mirrored to MissionMemory.knownIssues (with prefix)
//   - "fix"           → mirrored to MissionMemory.attemptedFixes
//   - "architecture"  → mirrored to MissionMemory.architectureNotes
//   - "convention"    → mirrored to MissionMemory.conventions
//   - keyFiles:<path> → mirrored to MissionMemory.keyFiles

import { missionEmitter } from "./event-emitter";
import type { MissionMemory } from "./types";

export type MemoryCategory =
  | "issue"
  | "fix"
  | "convention"
  | "architecture"
  | "error-pattern";

export interface MemoryEntry {
  key: string;
  value: string;
  category: MemoryCategory;
  timestamp: number;
}

export interface MemoryUpdateInput {
  key: string;
  value: string;
  category: string;
}

const MAX_ENTRIES_PER_MISSION = 500;
const MAX_MIRROR_LIST = 30;

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  issue: "Issues found",
  "error-pattern": "Error patterns",
  fix: "Fixes attempted",
  architecture: "Architecture",
  convention: "Conventions",
};

const SUMMARY_ORDER: MemoryCategory[] = [
  "issue",
  "error-pattern",
  "fix",
  "architecture",
  "convention",
];

function isMemoryCategory(s: string): s is MemoryCategory {
  return (
    s === "issue" ||
    s === "fix" ||
    s === "convention" ||
    s === "architecture" ||
    s === "error-pattern"
  );
}

function coerceCategory(s: string): MemoryCategory {
  return isMemoryCategory(s) ? s : "issue";
}

/**
 * Per-mission memory loop. The class is a singleton; per-mission state is
 * keyed by missionId in private maps.
 */
export class MemoryLoop {
  private readonly entries = new Map<string, MemoryEntry[]>();

  /**
   * Update mission memory with a batch of findings.
   * - De-duplicates by key (latest value wins).
   * - Mirrors structured fields into MissionMemory (via missionEmitter).
   * - Emits `memory:update` MissionEvents for SSE consumers.
   */
  update(missionId: string, updates: MemoryUpdateInput[]): void {
    if (!missionId || updates.length === 0) return;

    const list = this.entries.get(missionId) ?? [];
    const state = missionEmitter.getState(missionId);
    const memory: MissionMemory | undefined = state?.memory;

    const now = Date.now();
    // Track which structured fields need updating so we can batch the writes.
    const pendingKnownIssues: string[] = memory ? [...memory.knownIssues] : [];
    const pendingFixes: string[] = memory ? [...memory.attemptedFixes] : [];
    const pendingArch: string[] = memory ? [...memory.architectureNotes] : [];
    const pendingConv: string[] = memory ? [...memory.conventions] : [];
    let pendingKeyFiles: Map<string, string> | null = null;

    for (const u of updates) {
      if (!u || typeof u.key !== "string" || typeof u.value !== "string") {
        continue;
      }
      const category = coerceCategory(u.category);
      const entry: MemoryEntry = {
        key: u.key,
        value: u.value,
        category,
        timestamp: now,
      };

      // De-dupe by key in the in-memory index (latest wins).
      const idx = list.findIndex((e) => e.key === entry.key);
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);

      // Mirror into MissionMemory structured fields.
      if (memory) {
        switch (category) {
          case "issue":
            if (!pendingKnownIssues.includes(entry.value)) {
              pendingKnownIssues.push(entry.value);
            }
            break;
          case "error-pattern":
            {
              const v = `[pattern] ${entry.value}`;
              if (!pendingKnownIssues.includes(v)) pendingKnownIssues.push(v);
            }
            break;
          case "fix":
            if (!pendingFixes.includes(entry.value)) pendingFixes.push(entry.value);
            break;
          case "architecture":
            if (!pendingArch.includes(entry.value)) pendingArch.push(entry.value);
            break;
          case "convention":
            if (!pendingConv.includes(entry.value)) pendingConv.push(entry.value);
            break;
        }
      }

      // Special "keyFiles:<path>" key → mirror into keyFiles map.
      if (entry.key.startsWith("keyFiles:")) {
        const filePath = entry.key.slice("keyFiles:".length);
        if (filePath) {
          pendingKeyFiles = pendingKeyFiles ?? new Map<string, string>();
          pendingKeyFiles.set(filePath, entry.value);
        }
      }

      // Emit a memory:update event for SSE consumers.
      missionEmitter.emit({
        type: "memory:update",
        missionId,
        key: entry.key,
        value: entry.value,
        timestamp: now,
      });
    }

    // Cap the in-memory list (keep the freshest entries).
    if (list.length > MAX_ENTRIES_PER_MISSION) {
      list.splice(0, list.length - MAX_ENTRIES_PER_MISSION);
    }
    this.entries.set(missionId, list);

    // Batch-update MissionMemory if anything changed.
    if (memory) {
      const updates: Partial<MissionMemory> = {};
      if (pendingKnownIssues.length !== memory.knownIssues.length) {
        updates.knownIssues = pendingKnownIssues.slice(-MAX_MIRROR_LIST);
      }
      if (pendingFixes.length !== memory.attemptedFixes.length) {
        updates.attemptedFixes = pendingFixes.slice(-MAX_MIRROR_LIST);
      }
      if (pendingArch.length !== memory.architectureNotes.length) {
        updates.architectureNotes = pendingArch.slice(-MAX_MIRROR_LIST);
      }
      if (pendingConv.length !== memory.conventions.length) {
        updates.conventions = pendingConv.slice(-MAX_MIRROR_LIST);
      }
      if (pendingKeyFiles && pendingKeyFiles.size > 0) {
        updates.keyFiles = pendingKeyFiles;
      }
      if (Object.keys(updates).length > 0) {
        missionEmitter.updateMemory(missionId, updates);
      }
    }
  }

  /**
   * Build a concise memory summary suitable for AI prompts.
   * Groups entries by category and lists up to N items per group.
   */
  summarize(missionId: string, perCategoryLimit = 12): string {
    const list = this.entries.get(missionId);
    if (!list || list.length === 0) return "(no memory yet)";

    const grouped = new Map<MemoryCategory, MemoryEntry[]>();
    for (const e of list) {
      const arr = grouped.get(e.category) ?? [];
      arr.push(e);
      grouped.set(e.category, arr);
    }

    const sections: string[] = [];
    for (const cat of SUMMARY_ORDER) {
      const items = grouped.get(cat);
      if (!items || items.length === 0) continue;
      // Show the most recent entries first within each category.
      const recent = items.slice(-perCategoryLimit).reverse();
      const lines = recent.map((i) => `- ${i.value}`).join("\n");
      sections.push(`${CATEGORY_LABELS[cat]}:\n${lines}`);
    }

    return sections.length > 0 ? sections.join("\n\n") : "(no memory yet)";
  }

  /**
   * Free-text search across memory entries (key + value, case-insensitive).
   */
  search(
    missionId: string,
    query: string,
    limit = 10,
  ): { key: string; value: string; category: string }[] {
    const list = this.entries.get(missionId);
    if (!list || list.length === 0 || !query) return [];
    const q = query.toLowerCase();
    const matches: MemoryEntry[] = [];
    for (const e of list) {
      if (
        e.key.toLowerCase().includes(q) ||
        e.value.toLowerCase().includes(q)
      ) {
        matches.push(e);
      }
      if (matches.length >= limit) break;
    }
    return matches.map((e) => ({
      key: e.key,
      value: e.value,
      category: e.category,
    }));
  }

  /** Get all entries for a mission filtered by category. */
  getByCategory(
    missionId: string,
    category: string,
  ): { key: string; value: string }[] {
    const list = this.entries.get(missionId);
    if (!list || list.length === 0) return [];
    const cat = coerceCategory(category);
    return list
      .filter((e) => e.category === cat)
      .map((e) => ({ key: e.key, value: e.value }));
  }

  /** Get all entries for a mission (newest last). */
  getAll(missionId: string): MemoryEntry[] {
    return this.entries.get(missionId) ?? [];
  }

  /** Clear all memory for a mission. */
  clear(missionId: string): void {
    this.entries.delete(missionId);
  }
}

/** Process-wide singleton. */
export const memoryLoop = new MemoryLoop();
