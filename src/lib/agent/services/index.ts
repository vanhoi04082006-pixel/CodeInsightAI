// CodeInsight AI — Service Layer Public API (Layer 3)
// Barrel export for all 6 services.

export type {
  GraphService,
  DiagramService,
  SearchService,
  GitService,
  RepoService,
  AIInsightService,
  GraphData,
  GraphStats,
  SearchResult,
  GitCommit,
  ChangeRecord,
} from "../contracts";

import { GraphServiceImpl } from "./graph-service";
import { DiagramServiceImpl } from "./diagram-service";
import { SearchServiceImpl } from "./search-service";
import { GitServiceImpl } from "./git-service";
import { RepoServiceImpl } from "./repo-service";
import { AIInsightServiceImpl } from "./ai-insight-service";

export { GraphServiceImpl, DiagramServiceImpl, SearchServiceImpl, GitServiceImpl, RepoServiceImpl, AIInsightServiceImpl };

import type { SemanticProjectModel } from "../contracts";

/**
 * Create all 6 services.
 * Services are stateless (except for internal caching) and can be reused.
 */
export function createServices(_spm: SemanticProjectModel) {
  return {
    graph: new GraphServiceImpl(),
    diagram: new DiagramServiceImpl(),
    search: new SearchServiceImpl(),
    git: new GitServiceImpl(),
    repo: new RepoServiceImpl(),
    aiInsight: new AIInsightServiceImpl(),
  };
}
