// CodeInsight AI — Refactor Roadmap Sequencer (Phase 2 — P2.5, capstone)
//
// Produces a sequenced refactor roadmap that respects CODE-LEVEL dependencies.
// Uses the symbol-level graph from P2.1 (`codegraph/builder.ts`) to validate
// that the AI's claimed `dependsOn` relationships (from P2.3) actually exist
// in the code: "Phase 1: fix these 3 issues (no deps on each other), Phase 2:
// these 2 issues (depend on Phase 1 outputs)".
//
// PURE FUNCTION: no I/O, no DB, no side-effects, no Date.now, no Math.random.
// Same inputs → same output every time. Top-level try/catch guarantees it
// never throws — internal errors degrade to an empty roadmap with a warning.
//
// Best-effort graph validation: if the graph is incomplete (unresolved calls
// — see P2.1 risks) but the AI's `dependsOn` is non-empty, we trust the AI
// and mark `confidence = "medium"`. When the graph DOES validate a dep, we
// mark `confidence = "high"`. Issues with neither graph nor AI deps are
// `confidence = "low"` (free-floating — schedule freely).
//
// Inputs:
//   - priorities   : EnhancedPriority[] (post-P2.3-sequenced — effortHours,
//                    releasePhase, dependsOn already validated)
//   - graph        : CodeGraph (P2.1 — file/function/class nodes + calls /
//                    uses / imports / extends / implements edges)
//   - issues       : Issue[] (the underlying static-analysis findings — used
//                    to look up each priority's `file` by title similarity)
//
// Output: RefactorRoadmap — phases[P0..P3], each with issues[], effort totals,
// and a `canParallelize` flag (true iff no intra-phase dependency edges).

import type { EnhancedPriority, ReleasePhase, Issue } from "./types";
import type { CodeGraph } from "./codegraph/builder";
import { findCallers } from "./codegraph/builder";

/** A single issue enriched with graph-validated dependency metadata. */
export interface RefactorRoadmapIssue {
  issue: string;
  file: string;
  effortHours: number;
  /** Issue titles this fix unblocks (their files depend on this file). */
  unblocks: string[];
  /** Code-level deps the graph confirms — each is "from→this file". */
  graphValidatedDeps: Array<{
    from: string;
    to: string;
    edgeType: "calls" | "uses" | "depends_on" | "imports";
  }>;
  /** AI-claimed deps from `priority.dependsOn` (may not be in the graph). */
  aiClaimedDeps: string[];
  /** high = graph-validated; medium = AI-only; low = no deps at all. */
  confidence: "high" | "medium" | "low";
}

/** A phase column in the roadmap. */
export interface RefactorRoadmapPhase {
  phase: ReleasePhase;
  title: string;
  issues: RefactorRoadmapIssue[];
  totalEffortHours: number;
  /** true iff no intra-phase dependencies — independent, parallelizable. */
  canParallelize: boolean;
}

/** The full sequenced refactor roadmap. */
export interface RefactorRoadmap {
  phases: RefactorRoadmapPhase[];
  totalEffortHours: number;
  /** total / critical-path (≥1.0). Higher = more parallelization possible. */
  parallelSpeedupFactor: number;
  warnings: string[];
}

const PHASE_ORDER: ReleasePhase[] = ["P0", "P1", "P2", "P3"];

const PHASE_TITLES: Record<ReleasePhase, string> = {
  P0: "Critical Fixes",
  P1: "High Priority",
  P2: "Medium Priority",
  P3: "Backlog",
};

const DEFAULT_EFFORT_HOURS = 4;

/**
 * Build a graph-validated refactor roadmap from AI priorities + the symbol
 * graph + the underlying static-analysis issues.
 *
 * Never throws. On internal error returns `{ phases: [], warnings: [...] }`.
 * On empty input returns `{ phases: [], warnings: ["No priorities to sequence"] }`.
 */
export function buildRefactorRoadmap(
  priorities: EnhancedPriority[],
  graph: CodeGraph,
  issues: Issue[],
): RefactorRoadmap {
  const warnings: string[] = [];

  try {
    // Defensive: tolerate non-array inputs (malformed callers / corrupted DB).
    const safePriorities = Array.isArray(priorities) ? priorities : [];
    const safeIssues = Array.isArray(issues) ? issues : [];
    const safeGraph =
      graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges)
        ? graph
        : { nodes: [], edges: [], nodeCount: 0, edgeCount: 0, builtAt: "" };

    // Empty input → spec smoke test.
    if (safePriorities.length === 0) {
      return {
        phases: [],
        totalEffortHours: 0,
        parallelSpeedupFactor: 1,
        warnings: ["No priorities to sequence"],
      };
    }

    // 1. Match each priority to its underlying Issue (by title similarity).
    //    find() returns the first match — same as spec. If no match found,
    //    `issue` is undefined and we fall back to file = "unknown" later.
    const matched: Array<{ priority: EnhancedPriority; issue: Issue | undefined }> =
      safePriorities.map((p) => {
        const issue = safeIssues.find(
          (i) =>
            !!i &&
            !!i.title &&
            !!p.issue &&
            (i.title === p.issue ||
              i.title.includes(p.issue) ||
              p.issue.includes(i.title)),
        );
        return { priority: p, issue };
      });

    // 2. For each matched issue's file, query the graph for dependencies.
    //    `graphValidatedDeps` records every (caller → this file) edge of
    //    type calls/uses/imports/depends_on. These are files that would be
    //    impacted by (or rely on) this file's fix.
    const enriched: RefactorRoadmapIssue[] = matched.map(({ priority, issue }) => {
      const file = issue?.file;
      const graphValidatedDeps: RefactorRoadmapIssue["graphValidatedDeps"] = [];

      if (file) {
        // findCallers returns nodes whose `calls`/`uses` edges point TO `file`.
        // Each caller node has its own `filePath` — record it as the dep source.
        const callers = findCallers(safeGraph as CodeGraph, file);
        for (const caller of callers) {
          if (!caller || !caller.filePath || caller.filePath === file) continue;
          graphValidatedDeps.push({
            from: caller.filePath,
            to: file,
            edgeType: "calls",
          });
        }

        // Also scan imports + depends_on edges (file-level) that point to `file`.
        // findCallers only filters on calls/uses — imports/depends_on need a
        // separate pass.
        const seen = new Set<string>();
        for (const dep of graphValidatedDeps) {
          seen.add(`${dep.from}|${dep.edgeType}`);
        }
        for (const edge of safeGraph.edges) {
          if (!edge || edge.to !== file) continue;
          if (edge.type !== "imports" && edge.type !== "depends_on") continue;
          if (!edge.from || edge.from === file) continue;
          const key = `${edge.from}|${edge.type}`;
          if (seen.has(key)) continue; // dedupe (same from+type)
          seen.add(key);
          graphValidatedDeps.push({
            from: edge.from,
            to: file,
            edgeType: edge.type as "imports" | "depends_on",
          });
        }
      }

      // 3. Cross-reference with other priorities: if priority B's issue lives
      //    in a file that depends on THIS file (i.e. is in graphValidatedDeps),
      //    then fixing THIS issue unblocks B.
      const unblocks: string[] = [];
      for (const other of matched) {
        if (!other || other.priority === priority) continue;
        if (other.priority.issue === priority.issue) continue;
        const otherFile = other.issue?.file;
        if (!otherFile || !file) continue;
        const depends = graphValidatedDeps.some((d) => d.from === otherFile);
        if (depends && !unblocks.includes(other.priority.issue)) {
          unblocks.push(other.priority.issue);
        }
      }

      // 4. Confidence: graph-validated > AI-only > none.
      const aiClaimedDeps = Array.isArray(priority.dependsOn)
        ? priority.dependsOn.filter((d): d is string => typeof d === "string")
        : [];
      const hasGraphDeps = graphValidatedDeps.length > 0;
      const hasAIDeps = aiClaimedDeps.length > 0;
      const confidence: "high" | "medium" | "low" = hasGraphDeps
        ? "high"
        : hasAIDeps
          ? "medium"
          : "low";

      // Per-issue warning: AI claimed deps but the graph doesn't validate any.
      // (Surfaced for observability — the UI shows confidence=medium too.)
      if (hasAIDeps && !hasGraphDeps) {
        warnings.push(
          `Priority "${priority.issue}" has AI-claimed deps but no graph-validated deps — confidence=medium`,
        );
      }

      // Per-issue warning: no underlying Issue found — file will be "unknown".
      if (!issue) {
        warnings.push(
          `Priority "${priority.issue}" has no matching Issue — file unknown, graph validation skipped`,
        );
      }

      const effortHours =
        typeof priority.effortHours === "number" && priority.effortHours > 0
          ? priority.effortHours
          : DEFAULT_EFFORT_HOURS;

      return {
        issue: priority.issue,
        file: file || "unknown",
        effortHours,
        unblocks,
        graphValidatedDeps,
        aiClaimedDeps,
        confidence,
      };
    });

    // 5. Group by releasePhase (default P3 when missing or invalid).
    const phases: RefactorRoadmapPhase[] = PHASE_ORDER.map((phase) => {
      // Map enriched[i] → matched[i].priority's releasePhase (with P3 default).
      const phaseIssues: RefactorRoadmapIssue[] = enriched
        .map((iss, i) => ({ iss, prio: matched[i].priority }))
        .filter(({ prio }) => {
          const ph = prio.releasePhase;
          return (ph && PHASE_ORDER.includes(ph) ? ph : "P3") === phase;
        })
        .map(({ iss }) => iss);

      if (phaseIssues.length === 0) return null;

      // 6. Intra-phase dependency check — if any issue's `unblocks` references
      //    another issue in the SAME phase, the phase is NOT parallelizable.
      const phaseIssueTitles = new Set(phaseIssues.map((i) => i.issue));
      const intraPhaseDeps = phaseIssues.some((iss) =>
        iss.unblocks.some((u) => phaseIssueTitles.has(u)),
      );

      const totalEffortHours = phaseIssues.reduce(
        (sum, i) => sum + i.effortHours,
        0,
      );

      return {
        phase,
        title: PHASE_TITLES[phase],
        issues: phaseIssues,
        totalEffortHours,
        canParallelize: !intraPhaseDeps,
      };
    }).filter((p): p is RefactorRoadmapPhase => p !== null);

    // 7. Compute totals + parallel speedup factor.
    const totalEffortHours = phases.reduce(
      (sum, p) => sum + p.totalEffortHours,
      0,
    );

    // Critical path: sum of effort for issues that block something else.
    // (Approximation — true critical path needs full topo-sort of the cross-
    // phase dependency DAG; this is a good enough upper bound for the UI's
    // "how much can I parallelize?" indicator.)
    const criticalPathHours = enriched
      .filter((i) => i.unblocks.length > 0)
      .reduce((sum, i) => sum + i.effortHours, 0);

    const parallelSpeedupFactor =
      criticalPathHours > 0
        ? Math.max(
            1,
            Math.round((totalEffortHours / criticalPathHours) * 10) / 10,
          )
        : 1;

    // 8. Warnings (cross-cutting, beyond per-issue ones already pushed).
    if (phases.length === 0) {
      warnings.push("No priorities to sequence");
    }
    if (totalEffortHours > 80) {
      warnings.push(
        `Total effort ${totalEffortHours}h exceeds 80h (2 person-weeks)`,
      );
    }
    const lowConfidenceCount = enriched.filter(
      (i) => i.confidence === "low",
    ).length;
    if (enriched.length > 0 && lowConfidenceCount > enriched.length / 2) {
      warnings.push(
        `${lowConfidenceCount}/${enriched.length} issues have low confidence (no graph or AI deps)`,
      );
    }

    return {
      phases,
      totalEffortHours,
      parallelSpeedupFactor,
      warnings,
    };
  } catch (err) {
    // NEVER throw out of buildRefactorRoadmap — degrade to empty roadmap.
    return {
      phases: [],
      totalEffortHours: 0,
      parallelSpeedupFactor: 1,
      warnings: [
        `Refactor roadmap internal error: ${
          err instanceof Error ? err.message : String(err)
        } — returning empty roadmap`,
      ],
    };
  }
}
