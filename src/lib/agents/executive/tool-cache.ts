// CodeInsight AI — Tool Result Cache
// Phase D: Per-mission cache for read-only tool results so the ReAct loop
// doesn't re-read the same file or re-list the same directory on every
// iteration. The cache is opt-in: side-effecting tools (run_command,
// edit_file, invoke_agent) are never cached, and any edit_file call
// invalidates cached reads of the affected path.
//
// Design:
//   - One cache slot per (missionId, tool, argsHash).
//   - Each entry has its own TTL — read_file gets 60s, list_files gets 30s,
//     git_status gets 10s (changes frequently), etc.
//   - A side-index (filePath → Set<argsHash>) accelerates invalidation when
//     edit_file is called.
//   - Cache stats (hits / misses / size) are tracked per mission for
//     post-mortem analysis.

import { extractToolFilePaths } from "./tool-selector";

// ── Public types ────────────────────────────────────────────────────────────
export interface CachedResult {
  tool: string;
  argsHash: string;
  result: unknown;
  timestamp: number;
  ttlMs: number;
  /** File paths referenced in the args (used by invalidateFile). */
  filePaths: string[];
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

// ── Per-tool TTL configuration (ms). 0 = never cache. ───────────────────────
const TOOL_TTL_MS: Record<string, number> = {
  read_file: 60_000,
  list_files: 30_000,
  search_code: 30_000,
  git_status: 10_000,
  git_diff: 30_000,
  analyze_ast: 60_000,
  web_search: 0, // never cache (results may change)
  run_command: 0, // never cache (side effects)
  edit_file: 0, // never cache (invalidates read_file instead)
  invoke_agent: 0, // never cache (side effects)
};

const DEFAULT_TTL_MS = 30_000;

// ── Internal: per-mission cache structure ───────────────────────────────────
interface MissionCache {
  /** argsHash → CachedResult (one entry per distinct argsHash). */
  entries: Map<string, CachedResult>;
  /** Normalized filePath → Set of argsHashes referencing it. */
  fileIndex: Map<string, Set<string>>;
  hits: number;
  misses: number;
}

function newMissionCache(): MissionCache {
  return {
    entries: new Map(),
    fileIndex: new Map(),
    hits: 0,
    misses: 0,
  };
}

// ── Internal: deterministic args hash ────────────────────────────────────────
// JSON.stringify is not stable across key orders, so we sort keys recursively
// before serializing. This guarantees the same args produce the same hash.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function hashArgs(tool: string, args: Record<string, unknown>): string {
  return `${tool}::${stableStringify(args)}`;
}

// ── Main cache class ────────────────────────────────────────────────────────
export class ToolCache {
  private cache = new Map<string, MissionCache>();
  private defaultTtl = DEFAULT_TTL_MS;

  /**
   * Get a cached result if still valid (within TTL).
   * Returns null on miss or expiry.
   */
  get(
    missionId: string,
    tool: string,
    args: Record<string, unknown>,
  ): unknown | null {
    // Side-effecting tools are never cached — short-circuit.
    if (!this.isCacheable(tool)) {
      this.bumpMiss(missionId);
      return null;
    }

    const mc = this.cache.get(missionId);
    if (!mc) {
      this.bumpMiss(missionId);
      return null;
    }

    const key = hashArgs(tool, args);
    const entry = mc.entries.get(key);
    if (!entry) {
      this.bumpMiss(missionId);
      return null;
    }

    // TTL check.
    const age = Date.now() - entry.timestamp;
    if (age > entry.ttlMs) {
      // Expired — evict and miss.
      mc.entries.delete(key);
      this.removeFromIndex(mc, entry);
      this.bumpMiss(missionId);
      return null;
    }

    mc.hits++;
    return entry.result;
  }

  /**
   * Cache a tool result. No-op for non-cacheable tools.
   */
  set(
    missionId: string,
    tool: string,
    args: Record<string, unknown>,
    result: unknown,
    ttlMs?: number,
  ): void {
    if (!this.isCacheable(tool)) return;

    const mc = this.getOrCreate(missionId);
    const key = hashArgs(tool, args);
    const ttl = ttlMs ?? TOOL_TTL_MS[tool] ?? this.defaultTtl;
    const filePaths = extractToolFilePaths(tool, args);

    // If an entry already exists, remove its old index entries first.
    const prev = mc.entries.get(key);
    if (prev) {
      this.removeFromIndex(mc, prev);
    }

    const entry: CachedResult = {
      tool,
      argsHash: key,
      result,
      timestamp: Date.now(),
      ttlMs: ttl,
      filePaths,
    };
    mc.entries.set(key, entry);

    // Add to file index for fast invalidation.
    for (const fp of filePaths) {
      const normalized = this.normalizePath(fp);
      let bucket = mc.fileIndex.get(normalized);
      if (!bucket) {
        bucket = new Set();
        mc.fileIndex.set(normalized, bucket);
      }
      bucket.add(key);
    }
  }

  /**
   * Invalidate cache entries that reference the given file path.
   * Called after edit_file to clear stale reads of the edited file.
   */
  invalidateFile(missionId: string, filePath: string): void {
    const mc = this.cache.get(missionId);
    if (!mc) return;

    const normalized = this.normalizePath(filePath);
    const bucket = mc.fileIndex.get(normalized);
    if (!bucket) return;

    // Remove every entry that referenced this path.
    for (const key of bucket) {
      const entry = mc.entries.get(key);
      if (entry) {
        mc.entries.delete(key);
        this.removeFromIndex(mc, entry);
      }
    }
    // The bucket itself is now empty (removeFromIndex will delete it).
  }

  /**
   * Invalidate all cache for a mission.
   */
  clear(missionId: string): void {
    this.cache.delete(missionId);
  }

  /**
   * Get cache stats for a mission (hits, misses, current size).
   */
  getStats(missionId: string): CacheStats {
    const mc = this.cache.get(missionId);
    if (!mc) return { hits: 0, misses: 0, size: 0 };
    return {
      hits: mc.hits,
      misses: mc.misses,
      size: mc.entries.size,
    };
  }

  // ── Public helpers ────────────────────────────────────────────────────────
  /**
   * Returns true if the tool's results are eligible for caching.
   * Side-effecting tools (run_command, edit_file, invoke_agent, web_search)
   * always return false.
   */
  isCacheable(tool: string): boolean {
    const ttl = TOOL_TTL_MS[tool];
    return typeof ttl === "number" && ttl > 0;
  }

  /**
   * Get the configured TTL for a tool (0 = not cacheable).
   */
  getTtl(tool: string): number {
    return TOOL_TTL_MS[tool] ?? 0;
  }

  // ── Internal ──────────────────────────────────────────────────────────────
  private getOrCreate(missionId: string): MissionCache {
    let mc = this.cache.get(missionId);
    if (!mc) {
      mc = newMissionCache();
      this.cache.set(missionId, mc);
    }
    return mc;
  }

  private bumpMiss(missionId: string): void {
    const mc = this.getOrCreate(missionId);
    mc.misses++;
  }

  private removeFromIndex(mc: MissionCache, entry: CachedResult): void {
    for (const fp of entry.filePaths) {
      const normalized = this.normalizePath(fp);
      const bucket = mc.fileIndex.get(normalized);
      if (!bucket) continue;
      bucket.delete(entry.argsHash);
      if (bucket.size === 0) {
        mc.fileIndex.delete(normalized);
      }
    }
  }

  private normalizePath(p: string): string {
    // Normalize: resolve . and .. segments, strip trailing slash.
    // We do NOT make it absolute here — callers should pass already-resolved
    // absolute paths for cross-tool consistency. Relative paths are normalized
    // in-place so equal relative paths still hash to the same key.
    if (!p) return p;
    const parts = p.split("/");
    const out: string[] = [];
    for (const part of parts) {
      if (part === "" || part === ".") continue;
      if (part === "..") {
        out.pop();
        continue;
      }
      out.push(part);
    }
    return out.join("/");
  }
}

// ── Module singleton ────────────────────────────────────────────────────────
export const toolCache = new ToolCache();
