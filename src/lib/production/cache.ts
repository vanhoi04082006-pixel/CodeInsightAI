// CodeInsight AI — Production: LRU Cache with TTL (Prompt 15)
// A lightweight in-memory LRU cache with per-entry TTL support.
// Tracks hit/miss statistics for observability.

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface CacheEntry<V> {
  value: V;
  expiresAt: number; // epoch ms; 0 = never expires
  createdAt: number;
  lastAccessedAt: number;
}

export interface CacheStats {
  name: string;
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  evictions: number;
  expired: number;
  hitRate: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Cache — LRU with TTL
// ────────────────────────────────────────────────────────────────────────────

export class Cache<V = unknown> {
  private entries = new Map<string, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;
  private readonly name: string;

  // Stats
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private expired = 0;

  constructor(name: string, maxSize: number, defaultTtlMs: number) {
    this.name = name;
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Retrieve a value. Returns `undefined` if absent or expired (expired entries
   * are evicted on access).
   */
  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }

    // TTL check
    if (entry.expiresAt !== 0 && entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      this.expired += 1;
      this.misses += 1;
      return undefined;
    }

    // LRU bump — re-insert at end (most-recently-used).
    this.entries.delete(key);
    entry.lastAccessedAt = Date.now();
    this.entries.set(key, entry);

    this.hits += 1;
    return entry.value;
  }

  /** Store a value with optional custom TTL (overrides default). */
  set(key: string, value: V, ttlMs?: number): void {
    const now = Date.now();
    const ttl = ttlMs ?? this.defaultTtlMs;
    const expiresAt = ttl > 0 ? now + ttl : 0;

    // If the key already exists, remove first so re-insertion bumps LRU order.
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxSize) {
      // Evict oldest (first key in insertion order).
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
        this.evictions += 1;
      }
    }

    this.entries.set(key, {
      value,
      expiresAt,
      createdAt: now,
      lastAccessedAt: now,
    });
  }

  /** Delete a single entry. */
  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  /** Remove all entries. */
  clear(): void {
    this.entries.clear();
  }

  /** Returns true if the key exists and is not expired (does not bump LRU). */
  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== 0 && entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      this.expired += 1;
      return false;
    }
    return true;
  }

  /** Current number of entries (including potentially-expired ones). */
  get size(): number {
    return this.entries.size;
  }

  /** Sweep all expired entries. Returns the count of evicted entries. */
  sweepExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== 0 && entry.expiresAt < now) {
        this.entries.delete(key);
        this.expired += 1;
        count++;
      }
    }
    return count;
  }

  /** Return a snapshot of cache statistics. */
  stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      name: this.name,
      size: this.entries.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      expired: this.expired,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }

  /** Reset statistics (entries are preserved). */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.expired = 0;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Registry — named caches for convenient lookup from across the app.
// ────────────────────────────────────────────────────────────────────────────

const cacheRegistry = new Map<string, Cache<unknown>>();

/** Create (or retrieve if already created) a named cache. */
export function createCache<V>(
  name: string,
  maxSize: number = 1000,
  ttlMs: number = 5 * 60 * 1000, // 5 min default
): Cache<V> {
  const existing = cacheRegistry.get(name);
  if (existing) return existing as Cache<V>;
  const cache = new Cache<V>(name, maxSize, ttlMs);
  cacheRegistry.set(name, cache as Cache<unknown>);
  return cache;
}

/** Retrieve a previously-created cache by name, or undefined. */
export function getCache<V>(name: string): Cache<V> | undefined {
  return cacheRegistry.get(name) as Cache<V> | undefined;
}

/** List all registered cache names with their stats. */
export function listCaches(): CacheStats[] {
  return Array.from(cacheRegistry.values()).map((c) => c.stats());
}

/** Clear all registered caches (used during graceful shutdown). */
export function clearAllCaches(): void {
  for (const cache of cacheRegistry.values()) {
    cache.clear();
  }
}
