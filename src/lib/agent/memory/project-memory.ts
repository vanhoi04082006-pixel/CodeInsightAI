// CodeInsight AI — Project Memory (Layer 7, Memory Layer 4)
// Per-project: cached SPM, indexes, and query results.
// In-memory only (rebuilt from AnalysisReport on load).

import type {
  ProjectMemory as IProjectMemory,
  SemanticProjectModel,
  IndexSystem,
  GraphData,
  SearchResult,
} from "../contracts";

export class ProjectMemoryImpl implements IProjectMemory {
  spm: SemanticProjectModel | null = null;
  indexes: IndexSystem | null = null;
  graphCache: Map<string, GraphData> = new Map();
  diagramCache: Map<string, unknown> = new Map();
  searchCache: Map<string, SearchResult[]> = new Map();

  /** Set the SPM (from buildSPM) */
  setSPM(spm: SemanticProjectModel): void {
    this.spm = spm;
    this.invalidate(); // clear caches when SPM changes
  }

  /** Set the indexes (from buildIndexes) */
  setIndexes(indexes: IndexSystem): void {
    this.indexes = indexes;
  }

  /** Get cached graph data */
  getCachedGraph(key: string): GraphData | null {
    return this.graphCache.get(key) ?? null;
  }

  /** Cache graph data */
  cacheGraph(key: string, data: GraphData): void {
    this.graphCache.set(key, data);
  }

  /** Get cached diagram */
  getCachedDiagram(key: string): unknown | null {
    return this.diagramCache.get(key) ?? null;
  }

  /** Cache diagram */
  cacheDiagram(key: string, data: unknown): void {
    this.diagramCache.set(key, data);
  }

  /** Get cached search results */
  getCachedSearch(key: string): SearchResult[] | null {
    return this.searchCache.get(key) ?? null;
  }

  /** Cache search results */
  cacheSearch(key: string, results: SearchResult[]): void {
    this.searchCache.set(key, results);
  }

  /** Invalidate all caches (when SPM changes) */
  invalidate(): void {
    this.graphCache.clear();
    this.diagramCache.clear();
    this.searchCache.clear();
  }

  /** Check if SPM is loaded */
  isLoaded(): boolean {
    return this.spm !== null && this.indexes !== null;
  }

  /** Clear everything */
  clear(): void {
    this.spm = null;
    this.indexes = null;
    this.invalidate();
  }

  /** Get cache stats */
  getStats(): { graphs: number; diagrams: number; searches: number } {
    return {
      graphs: this.graphCache.size,
      diagrams: this.diagramCache.size,
      searches: this.searchCache.size,
    };
  }
}
