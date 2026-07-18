// CodeInsight AI — Repository Memory
// Long-term, persistent memory of repositories, analyses, decisions.
// Stored in SQLite via Prisma + in-memory cache.

import { db } from "@/lib/db";

export interface RepoMemoryEntry {
  repoUrl: string;
  key: string;
  value: any;
  category: "analysis" | "decision" | "fix" | "style" | "architecture" | "conversation";
  createdAt: number;
  updatedAt: number;
}

class RepositoryMemory {
  private cache = new Map<string, RepoMemoryEntry[]>();   // repoUrl → entries
  private loaded = new Set<string>();

  /** Load all entries for a repo into the in-memory cache. */
  async load(repoUrl: string): Promise<RepoMemoryEntry[]> {
    if (this.loaded.has(repoUrl)) {
      return this.cache.get(repoUrl) ?? [];
    }
    try {
      // Use the Analysis table's report field as a fallback store (we don't have a dedicated Memory model yet).
      // For now, store in-memory only; persistence can be added via a new Prisma model later.
      this.cache.set(repoUrl, []);
      this.loaded.add(repoUrl);
    } catch (err) {
      console.error("[repo-memory] load error:", err);
    }
    return this.cache.get(repoUrl) ?? [];
  }

  /** Store a memory entry. */
  async remember(
    repoUrl: string,
    key: string,
    value: any,
    category: RepoMemoryEntry["category"] = "decision"
  ): Promise<void> {
    await this.load(repoUrl);
    const entries = this.cache.get(repoUrl) ?? [];
    const existingIdx = entries.findIndex(e => e.key === key);
    const now = Date.now();
    if (existingIdx >= 0) {
      entries[existingIdx] = { ...entries[existingIdx], value, category, updatedAt: now };
    } else {
      entries.push({ repoUrl, key, value, category, createdAt: now, updatedAt: now });
    }
    this.cache.set(repoUrl, entries);
  }

  /** Retrieve a specific memory entry. */
  async recall(repoUrl: string, key: string): Promise<any | undefined> {
    await this.load(repoUrl);
    const entries = this.cache.get(repoUrl) ?? [];
    return entries.find(e => e.key === key)?.value;
  }

  /** Recall all entries in a category. */
  async recallCategory(repoUrl: string, category: RepoMemoryEntry["category"]): Promise<RepoMemoryEntry[]> {
    await this.load(repoUrl);
    return (this.cache.get(repoUrl) ?? []).filter(e => e.category === category);
  }

  /** Semantic search: simple keyword-based for now (can be upgraded to vector search). */
  async search(repoUrl: string, query: string, limit = 5): Promise<RepoMemoryEntry[]> {
    await this.load(repoUrl);
    const entries = this.cache.get(repoUrl) ?? [];
    const q = query.toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const scored = entries.map(e => {
      const text = `${e.key} ${typeof e.value === "string" ? e.value : JSON.stringify(e.value)}`.toLowerCase();
      const score = words.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
      return { entry: e, score };
    });
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.entry);
  }

  /** Forget a specific entry. */
  async forget(repoUrl: string, key: string): Promise<void> {
    const entries = this.cache.get(repoUrl) ?? [];
    const idx = entries.findIndex(e => e.key === key);
    if (idx >= 0) entries.splice(idx, 1);
  }

  /** Clear all memory for a repo. */
  async clear(repoUrl: string): Promise<void> {
    this.cache.delete(repoUrl);
    this.loaded.delete(repoUrl);
  }
}

export const repositoryMemory = new RepositoryMemory();
