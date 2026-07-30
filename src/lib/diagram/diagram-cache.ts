// CodeInsight AI — Diagram Cache
// LRU cache keyed by analysisId + diagramType + layoutType.
// Prevents re-building diagrams when data hasn't changed.

import type { Diagram } from "./types";
import type { LayoutType } from "./diagram-layout";

interface CacheEntry {
  diagram: Diagram;
  timestamp: number;
}

const MAX_SIZE = 50; // max 50 cached diagrams
const TTL_MS = 5 * 60 * 1000; // 5 minute TTL

const cache = new Map<string, CacheEntry>();

function makeKey(analysisId: string, type: string, layout: string): string {
  return `${analysisId}::${type}::${layout}`;
}

export function getCachedDiagram(analysisId: string, type: string, layout: LayoutType): Diagram | null {
  const key = makeKey(analysisId, type, layout);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Move to end (LRU)
  cache.delete(key);
  cache.set(key, entry);
  return entry.diagram;
}

export function setCachedDiagram(analysisId: string, type: string, layout: LayoutType, diagram: Diagram): void {
  const key = makeKey(analysisId, type, layout);
  // Evict oldest if at capacity
  if (cache.size >= MAX_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { diagram, timestamp: Date.now() });
}

export function clearCache(analysisId?: string): void {
  if (!analysisId) { cache.clear(); return; }
  for (const key of cache.keys()) {
    if (key.startsWith(`${analysisId}::`)) cache.delete(key);
  }
}

export function getCacheStats() {
  return { size: cache.size, maxSize: MAX_SIZE };
}
