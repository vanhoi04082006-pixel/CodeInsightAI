// CodeInsight AI — Knowledge Base: Memory Store (Prompt 13)
// Long-term semantic memory for repositories, conversations, fixes, decisions,
// and coding style. Pluggable storage — in-memory L1 cache (LRU eviction) with
// Prisma-backed L2 persistence (MemoryEntry table).
//
// Resilience: every Prisma call is wrapped in try/catch — if the DB is
// unavailable, the store silently falls back to memory-only operation and
// emits a warning log. The in-memory cache is always the source of truth for
// reads; persistence is best-effort.

import { db } from "@/lib/db";

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
  repoUrl?: string;
}

export interface MemorySearchOptions {
  category?: MemoryCategory;
  tags?: string[];
  limit?: number;
  minScore?: number;
  repoUrl?: string;
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

/** Extract an optional repoUrl from a MemoryEntry's tags (`repo:<url>` convention). */
function repoUrlFromTags(tags: string[]): string | undefined {
  const tag = tags.find((t) => t.startsWith("repo:"));
  return tag ? tag.slice("repo:".length) : undefined;
}

/** Safe JSON stringify — never throws. */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

/** Safe JSON parse with fallback. */
function safeParseArray<T>(text: string | null | undefined, fallback: T[] = []): T[] {
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

/** Safe JSON parse for arbitrary value. */
function safeParseValue(text: string | null | undefined): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// MemoryStore — in-memory L1 (Map with LRU eviction) + Prisma L2 persistence.
// ────────────────────────────────────────────────────────────────────────────

export class MemoryStore {
  private entries = new Map<string, MemoryEntry>();
  // Track access order for LRU — keys in insertion order from oldest to newest.
  // We use a Map (which preserves insertion order) and re-insert on access.
  private readonly maxEntries: number;
  private dbLoaded = false;
  private dbAvailable = true;

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

    // If not in L1 cache, try L2 (Prisma) as a fallback lookup.
    if (!existing && this.dbAvailable) {
      existing = await this.loadFromDBByKey(entry.category, entry.key);
      if (existing) {
        // Hydrate the L1 cache with the DB-loaded entry.
        this.entries.set(existing.id, existing);
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
      repoUrl: entry.repoUrl ?? existing?.repoUrl ?? repoUrlFromTags(entry.tags ?? []),
    };

    // Remove the existing entry so re-insertion moves it to the end (most-recent).
    if (existing) this.entries.delete(id);
    this.entries.set(id, merged);

    // LRU eviction if over capacity.
    this.evictIfNeeded();

    // Best-effort persist to Prisma L2.
    await this.persistToDB(merged);

    return merged;
  }

  /** Retrieve a single entry by id (also bumps LRU + accessCount). */
  async retrieve(id: string): Promise<MemoryEntry | null> {
    // L1 lookup
    let entry = this.entries.get(id);
    if (!entry) {
      // L2 fallback (Prisma)
      if (this.dbAvailable) {
        entry = await this.loadFromDBById(id);
        if (entry) {
          // Hydrate L1 cache.
          this.entries.set(id, entry);
        }
      }
      if (!entry) return null;
    }

    entry.accessCount += 1;
    // Move to end (most-recently-used).
    this.entries.delete(id);
    this.entries.set(id, entry);

    // Best-effort: bump accessCount + updatedAt in DB
    await this.touchDB(id, entry.accessCount);

    return entry;
  }

  /**
   * Keyword-based search across all entries. Each query word that appears in the
   * entry's key, value (stringified), or tags contributes 1 to the score.
   * Tags also get a small relevance boost. Vector embeddings are honored when
   * present (cosine similarity) — falls back to keyword scoring otherwise.
   *
   * Searches both the in-memory cache AND the Prisma DB (when available) so
   * results survive process restarts.
   */
  async search(query: string, options: MemorySearchOptions = {}): Promise<MemoryEntry[]> {
    const { category, tags, limit = 10, minScore = 0.1, repoUrl } = options;
    const q = (query ?? "").toLowerCase().trim();
    const queryWords = q.split(/\s+/).filter(Boolean);
    const queryEmbedding = this.tryParseQueryAsVector(q);

    // Aggregate candidate entries from both L1 and L2.
    const seen = new Set<string>();
    const candidates: MemoryEntry[] = [];

    // L1 candidates
    for (const e of this.entries.values()) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        candidates.push(e);
      }
    }

    // L2 candidates (Prisma)
    if (this.dbAvailable) {
      const dbEntries = await this.searchDB(query, options);
      for (const e of dbEntries) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          candidates.push(e);
        }
      }
    }

    const hits: MemorySearchHit[] = [];

    for (const entry of candidates) {
      if (category && entry.category !== category) continue;
      if (repoUrl && entry.repoUrl !== repoUrl) continue;
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
      } else if (!queryEmbedding) {
        // No query words AND no embedding → no signal. Skip.
        continue;
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
    const seen = new Set<string>();

    // L1
    for (const e of this.entries.values()) {
      if (e.tags.includes(tag)) {
        seen.add(e.id);
        out.push(e);
        if (out.length >= limit) break;
      }
    }

    // L2 fallback if not enough results in L1
    if (out.length < limit && this.dbAvailable) {
      const dbEntries = await this.searchDBByTag(tag, limit * 2);
      for (const e of dbEntries) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
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
    const seen = new Set<string>();

    // L1
    for (const e of this.entries.values()) {
      if (e.category === category) {
        seen.add(e.id);
        out.push(e);
      }
    }

    // L2 fallback
    if (this.dbAvailable) {
      const dbEntries = await this.searchDBByCategory(category, limit * 2);
      for (const e of dbEntries) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        out.push(e);
      }
    }

    // Most-recently-updated first
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out.slice(0, limit);
  }

  /** Delete a single entry by id. */
  async forget(id: string): Promise<void> {
    this.entries.delete(id);

    // Best-effort delete from Prisma L2
    if (this.dbAvailable) {
      try {
        await db.memoryEntry.delete({ where: { id } });
      } catch {
        // Not found or DB unavailable — ignore.
      }
    }
  }

  /** Clear all entries, or only those in `category` if specified. */
  async clear(category?: MemoryCategory): Promise<void> {
    if (!category) {
      this.entries.clear();
      if (this.dbAvailable) {
        try {
          await db.memoryEntry.deleteMany({});
        } catch {
          this.markDBUnavailable("clear-all");
        }
      }
      return;
    }

    // L1
    for (const [id, e] of this.entries) {
      if (e.category === category) this.entries.delete(id);
    }

    // L2
    if (this.dbAvailable) {
      try {
        await db.memoryEntry.deleteMany({ where: { category } });
      } catch {
        this.markDBUnavailable("clear-category");
      }
    }
  }

  /** Return a snapshot of all entries (does not bump access counts). */
  async getAll(): Promise<MemoryEntry[]> {
    const seen = new Set<string>();
    const out: MemoryEntry[] = [];

    // L1
    for (const e of this.entries.values()) {
      seen.add(e.id);
      out.push(e);
    }

    // L2 (only loads entries not already in L1)
    if (this.dbAvailable) {
      try {
        const rows = await db.memoryEntry.findMany();
        for (const row of rows) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          out.push(this.dbRowToEntry(row));
        }
      } catch {
        this.markDBUnavailable("getAll");
      }
    }

    return out;
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
      // Best-effort persist
      await this.persistToDB({ ...e });
    }
    this.evictIfNeeded();
  }

  /**
   * Load all entries from Prisma L2 into the L1 cache on startup.
   * Idempotent — only runs once per instance. Useful for warming the cache
   * after a process restart.
   */
  async loadFromDB(): Promise<number> {
    if (this.dbLoaded || !this.dbAvailable) return 0;
    this.dbLoaded = true;

    try {
      const rows = await db.memoryEntry.findMany({
        orderBy: { updatedAt: "desc" },
        take: this.maxEntries,
      });
      let count = 0;
      // Insert in reverse so the LRU order reflects most-recent-first insertion.
      for (let i = rows.length - 1; i >= 0; i--) {
        const entry = this.dbRowToEntry(rows[i]);
        if (!this.entries.has(entry.id)) {
          this.entries.set(entry.id, entry);
          count++;
        }
      }
      this.evictIfNeeded();
      return count;
    } catch {
      this.markDBUnavailable("loadFromDB");
      return 0;
    }
  }

  // ── Prisma L2 helpers ──────────────────────────────────────────────────

  /** Best-effort persist (upsert) of a single entry to the DB. */
  private async persistToDB(entry: MemoryEntry): Promise<void> {
    if (!this.dbAvailable) return;
    try {
      await db.memoryEntry.upsert({
        where: { id: entry.id },
        create: {
          id: entry.id,
          category: entry.category,
          key: entry.key,
          value: safeStringify(entry.value),
          tags: safeStringify(entry.tags),
          repoUrl: entry.repoUrl ?? null,
          createdAt: new Date(entry.createdAt),
          updatedAt: new Date(entry.updatedAt),
          accessCount: entry.accessCount,
        },
        update: {
          value: safeStringify(entry.value),
          tags: safeStringify(entry.tags),
          repoUrl: entry.repoUrl ?? null,
          updatedAt: new Date(entry.updatedAt),
          accessCount: entry.accessCount,
        },
      });
    } catch {
      // Silently swallow — L1 cache is the source of truth for reads.
      // We do NOT mark DB unavailable for a single upsert failure
      // (could be a transient constraint violation).
    }
  }

  /** Bump accessCount in DB (best-effort, never throws). */
  private async touchDB(id: string, accessCount: number): Promise<void> {
    if (!this.dbAvailable) return;
    try {
      await db.memoryEntry.update({
        where: { id },
        data: { accessCount, updatedAt: new Date() },
      });
    } catch {
      // Ignore — entry may not exist in DB yet, or DB unavailable.
    }
  }

  /** Load a single entry by id from the DB. */
  private async loadFromDBById(id: string): Promise<MemoryEntry | undefined> {
    if (!this.dbAvailable) return undefined;
    try {
      const row = await db.memoryEntry.findUnique({ where: { id } });
      return row ? this.dbRowToEntry(row) : undefined;
    } catch {
      this.markDBUnavailable("loadFromDBById");
      return undefined;
    }
  }

  /** Load a single entry by (category, key) from the DB. */
  private async loadFromDBByKey(category: MemoryCategory, key: string): Promise<MemoryEntry | undefined> {
    if (!this.dbAvailable) return undefined;
    try {
      // (category, key, repoUrl) is the unique constraint, but repoUrl is
      // nullable. SQLite treats NULLs as distinct in unique constraints, so
      // we filter by category+key and pick the most recent.
      const rows = await db.memoryEntry.findMany({
        where: { category, key },
        orderBy: { updatedAt: "desc" },
        take: 1,
      });
      return rows[0] ? this.dbRowToEntry(rows[0]) : undefined;
    } catch {
      this.markDBUnavailable("loadFromDBByKey");
      return undefined;
    }
  }

  /** Query the DB for entries matching the search options (used as candidates). */
  private async searchDB(query: string, options: MemorySearchOptions): Promise<MemoryEntry[]> {
    if (!this.dbAvailable) return [];
    try {
      const where: {
        category?: string;
        repoUrl?: string;
        OR?: Array<{ key?: { contains: string }; value?: { contains: string }; tags?: { contains: string } }>;
      } = {};
      if (options.category) where.category = options.category;
      if (options.repoUrl) where.repoUrl = options.repoUrl;

      const q = (query ?? "").toLowerCase().trim();
      if (q) {
        // SQLite LIKE is case-insensitive for ASCII; we still lowercase the query.
        where.OR = [
          { key: { contains: q } },
          { value: { contains: q } },
          { tags: { contains: q } },
        ];
      }

      const rows = await db.memoryEntry.findMany({
        where,
        take: (options.limit ?? 10) * 4,
        orderBy: { updatedAt: "desc" },
      });

      let entries = rows.map((r) => this.dbRowToEntry(r));

      // Filter by tag inclusion (Prisma can't easily do "array contains all"
      // for JSON-stringified tags on SQLite, so we post-filter).
      if (options.tags && options.tags.length > 0) {
        entries = entries.filter((e) => options.tags!.every((t) => e.tags.includes(t)));
      }
      return entries;
    } catch {
      this.markDBUnavailable("searchDB");
      return [];
    }
  }

  /** Query the DB by tag (substring match on JSON-stringified tags array). */
  private async searchDBByTag(tag: string, limit: number): Promise<MemoryEntry[]> {
    if (!this.dbAvailable) return [];
    try {
      const rows = await db.memoryEntry.findMany({
        where: { tags: { contains: `"${tag}"` } },
        take: limit,
        orderBy: { updatedAt: "desc" },
      });
      return rows.map((r) => this.dbRowToEntry(r));
    } catch {
      this.markDBUnavailable("searchDBByTag");
      return [];
    }
  }

  /** Query the DB by category. */
  private async searchDBByCategory(category: MemoryCategory, limit: number): Promise<MemoryEntry[]> {
    if (!this.dbAvailable) return [];
    try {
      const rows = await db.memoryEntry.findMany({
        where: { category },
        take: limit,
        orderBy: { updatedAt: "desc" },
      });
      return rows.map((r) => this.dbRowToEntry(r));
    } catch {
      this.markDBUnavailable("searchDBByCategory");
      return [];
    }
  }

  /** Convert a Prisma MemoryEntry row to the in-memory MemoryEntry shape. */
  private dbRowToEntry(row: {
    id: string;
    category: string;
    key: string;
    value: string;
    tags: string;
    repoUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    accessCount: number;
  }): MemoryEntry {
    return {
      id: row.id,
      category: row.category as MemoryCategory,
      key: row.key,
      value: safeParseValue(row.value),
      tags: safeParseArray<string>(row.tags),
      repoUrl: row.repoUrl ?? undefined,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
      accessCount: row.accessCount,
    };
  }

  /** Mark the DB as unavailable (e.g. connection lost). Subsequent calls bypass DB. */
  private markDBUnavailable(caller: string): void {
    if (!this.dbAvailable) return;
    this.dbAvailable = false;
    // Use console.warn — we don't want a circular dependency on the logger.
    console.warn(
      `[memory-store] Prisma unavailable (${caller}) — falling back to memory-only mode.`,
    );
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
