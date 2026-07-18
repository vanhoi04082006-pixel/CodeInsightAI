// CodeInsight AI — Knowledge Base: Memory Store (Prompt 13)
// Long-term semantic memory for repositories, conversations, fixes, decisions,
// and coding style. Pluggable storage — currently in-memory with LRU eviction;
// persistence to Prisma can be layered in later by replacing this class.

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type MemoryCategory =
  | "repository"
  | "conversation"
  | "coding-style"
  | "previous-fix"
  | "architecture-decision";

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  key: string;
  value: unknown;
  tags: string[];
  embedding?: number[];
  createdAt: number;
  updatedAt: number;
  accessCount: number;
}

export interface MemorySearchOptions {
  category?: MemoryCategory;
  tags?: string[];
  limit?: number;
  minScore?: number;
}

export interface MemorySearchHit {
  entry: MemoryEntry;
  score: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const MAX_ENTRIES = 1000;

// ────────────────────────────────────────────────────────────────────────────
// Utility — small id generator (no external dependency).
// ────────────────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${ts}${rand}`;
}

// ────────────────────────────────────────────────────────────────────────────
// MemoryStore — in-memory Map with LRU eviction + keyword search.
// ────────────────────────────────────────────────────────────────────────────

export class MemoryStore {
  private entries = new Map<string, MemoryEntry>();
  // Track access order for LRU — keys in insertion order from oldest to newest.
  // We use a Map (which preserves insertion order) and re-insert on access.
  private readonly maxEntries: number;

  constructor(maxEntries: number = MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  /** Add or update a memory entry. If `id` is omitted, a new one is generated. */
  async store(entry: Partial<MemoryEntry> & { category: MemoryCategory; key: string; value: unknown }): Promise<MemoryEntry> {
    const now = Date.now();

    // Look up an existing entry by id, or by (category, key) when id is missing.
    let existing: MemoryEntry | undefined;
    if (entry.id) {
      existing = this.entries.get(entry.id);
    } else {
      for (const e of this.entries.values()) {
        if (e.category === entry.category && e.key === entry.key) {
          existing = e;
          break;
        }
      }
    }

    const id = existing?.id ?? entry.id ?? generateId(entry.category);
    const merged: MemoryEntry = {
      id,
      category: entry.category,
      key: entry.key,
      value: entry.value,
      tags: entry.tags ?? existing?.tags ?? [],
      embedding: entry.embedding ?? existing?.embedding,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      accessCount: existing?.accessCount ?? 0,
    };

    // Remove the existing entry so re-insertion moves it to the end (most-recent).
    if (existing) this.entries.delete(id);
    this.entries.set(id, merged);

    // LRU eviction if over capacity.
    this.evictIfNeeded();

    return merged;
  }

  /** Retrieve a single entry by id (also bumps LRU + accessCount). */
  async retrieve(id: string): Promise<MemoryEntry | null> {
    const entry = this.entries.get(id);
    if (!entry) return null;
    entry.accessCount += 1;
    // Move to end (most-recently-used).
    this.entries.delete(id);
    this.entries.set(id, entry);
    return entry;
  }

  /**
   * Keyword-based search across all entries. Each query word that appears in the
   * entry's key, value (stringified), or tags contributes 1 to the score.
   * Tags also get a small relevance boost. Vector embeddings are honored when
   * present (cosine similarity) — falls back to keyword scoring otherwise.
   */
  async search(query: string, options: MemorySearchOptions = {}): Promise<MemoryEntry[]> {
    const { category, tags, limit = 10, minScore = 0.1 } = options;
    const q = (query ?? "").toLowerCase().trim();
    const queryWords = q.split(/\s+/).filter(Boolean);
    const queryEmbedding = this.tryParseQueryAsVector(q);

    const hits: MemorySearchHit[] = [];

    for (const entry of this.entries.values()) {
      if (category && entry.category !== category) continue;
      if (tags && tags.length > 0 && !tags.every((t) => entry.tags.includes(t))) continue;

      let score = 0;

      // Vector similarity (if both entry and query have embeddings)
      if (queryEmbedding && entry.embedding && entry.embedding.length > 0) {
        score = Math.max(score, cosineSimilarity(queryEmbedding, entry.embedding));
      }

      // Keyword scoring
      if (queryWords.length > 0) {
        const haystack = this.entryToText(entry);
        for (const w of queryWords) {
          if (haystack.includes(w)) score += 1;
        }
        // Tag matches get an extra boost
        for (const w of queryWords) {
          if (entry.tags.some((t) => t.toLowerCase().includes(w))) score += 0.5;
        }
        // Exact key match gets a big boost
        if (entry.key.toLowerCase() === q) score += 5;
      }

      if (score >= minScore) {
        hits.push({ entry, score });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit).map((h) => h.entry);
  }

  /** All entries that have a specific tag. */
  async searchByTag(tag: string, limit: number = 50): Promise<MemoryEntry[]> {
    const out: MemoryEntry[] = [];
    for (const e of this.entries.values()) {
      if (e.tags.includes(tag)) {
        out.push(e);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  /** All entries in a specific category. */
  async searchByCategory(
    category: MemoryCategory,
    limit: number = 50,
  ): Promise<MemoryEntry[]> {
    const out: MemoryEntry[] = [];
    for (const e of this.entries.values()) {
      if (e.category === category) {
        out.push(e);
        if (out.length >= limit) break;
      }
    }
    // Most-recently-updated first
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }

  /** Delete a single entry by id. */
  async forget(id: string): Promise<void> {
    this.entries.delete(id);
  }

  /** Clear all entries, or only those in `category` if specified. */
  async clear(category?: MemoryCategory): Promise<void> {
    if (!category) {
      this.entries.clear();
      return;
    }
    for (const [id, e] of this.entries) {
      if (e.category === category) this.entries.delete(id);
    }
  }

  /** Return a snapshot of all entries (does not bump access counts). */
  async getAll(): Promise<MemoryEntry[]> {
    return Array.from(this.entries.values());
  }

  /** Export every entry as a JSON string. */
  async exportJSON(): Promise<string> {
    const all = await this.getAll();
    return JSON.stringify(
      {
        version: 1,
        exportedAt: Date.now(),
        count: all.length,
        entries: all,
      },
      null,
      2,
    );
  }

  /** Import entries from a JSON string. Merges with existing entries. */
  async importJSON(json: string): Promise<void> {
    const parsed = JSON.parse(json) as
      | { entries?: MemoryEntry[] }
      | MemoryEntry[];
    const list = Array.isArray(parsed) ? parsed : parsed.entries ?? [];
    for (const e of list) {
      if (!e || !e.id || !e.category || !e.key) continue;
      // Insert directly (bypass store() to preserve original timestamps)
      this.entries.set(e.id, { ...e });
    }
    this.evictIfNeeded();
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private entryToText(entry: MemoryEntry): string {
    const valueText =
      typeof entry.value === "string"
        ? entry.value
        : (() => {
            try {
              return JSON.stringify(entry.value);
            } catch {
              return String(entry.value);
            }
          })();
    return `${entry.key} ${entry.category} ${entry.tags.join(" ")} ${valueText}`.toLowerCase();
  }

  private tryParseQueryAsVector(q: string): number[] | null {
    // Heuristic: a comma-separated list of numbers → embedding.
    if (/^\s*-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?)+\s*$/.test(q)) {
      const vec = q
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !Number.isNaN(n));
      if (vec.length >= 4) return vec;
    }
    return null;
  }

  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries) {
      // Map iteration order = insertion order; oldest entry is first.
      const oldestId = this.entries.keys().next().value;
      if (oldestId === undefined) break;
      this.entries.delete(oldestId);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Cosine similarity — for future vector-based search.
// ────────────────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// Singleton
export const memoryStore = new MemoryStore();
