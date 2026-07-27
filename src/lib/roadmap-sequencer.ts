// CodeInsight AI — Roadmap Sequencer (Phase 2 — P2.3)
//
// A DETERMINISTIC post-processor that runs AFTER the AI returns priorities.
// It does NOT call the AI — it validates and re-orders the AI's output to
// guarantee the invariants the RoadmapTab UI relies on:
//
//   1. Every dependsOn reference points to an existing priority title.
//      Invalid refs are silently dropped (logged to warnings[]).
//   2. The dependsOn graph has no cycles. If a cycle is detected, it is
//      broken by removing the LAST edge in the cycle path (DFS-detected).
//   3. releasePhase is monotonic along the dependency DAG: if A depends on
//      B, then phase(A) >= phase(B). Otherwise A is promoted to B's phase.
//      (P0=0 < P1=1 < P2=2 < P3=3 — later phase means LATER, not "more
//      important". A P0 task that depends on a P2 task is impossible.)
//   4. Priorities are topologically sorted (Kahn's), then by phase asc,
//      then roiScore desc — so the UI shows the highest-ROI work first
//      within each phase.
//   5. Roadmap phases have their estimatedEffortHours re-summed from member
//      priorities (the AI's estimate may drift). Phases over 80h warn.
//
// CRITICAL: sequenceRoadmap must NEVER throw — all failures are soft
// (warning pushed, problem element skipped/passed-through). This protects
// the AI-pass route, which would otherwise lose the entire priorities pass
// if the sequencer crashed on malformed AI output.

import type { EnhancedPriority, RoadmapPhase, ReleasePhase } from "./types";

export interface SequencerResult {
  sequencedPriorities: EnhancedPriority[];
  sequencedRoadmap: RoadmapPhase[];
  warnings: string[];
}

const PHASE_ORDER: Record<ReleasePhase, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const VALID_PHASES = new Set<ReleasePhase>(["P0", "P1", "P2", "P3"]);

/** Default phase when AI omits releasePhase or returns garbage. */
const DEFAULT_PHASE: ReleasePhase = "P3";

function coercePhase(raw: unknown): ReleasePhase {
  if (typeof raw === "string" && VALID_PHASES.has(raw as ReleasePhase)) {
    return raw as ReleasePhase;
  }
  return DEFAULT_PHASE;
}

/**
 * Validate + sequence the AI's priorities output. Never throws — returns
 * the input largely untouched (but coerced to safe shapes) if anything
 * unexpected happens, with warnings captured for logging.
 */
export function sequenceRoadmap(
  priorities: EnhancedPriority[],
  roadmap: RoadmapPhase[],
): SequencerResult {
  const warnings: string[] = [];

  try {
    // Defensive: tolerate non-array inputs from malformed AI output.
    const safePriorities = Array.isArray(priorities) ? priorities : [];
    const safeRoadmap = Array.isArray(roadmap) ? roadmap : [];

    if (safePriorities.length === 0) {
      return {
        sequencedPriorities: [],
        sequencedRoadmap: safeRoadmap,
        warnings,
      };
    }

    // 0. Coerce releasePhase to a safe enum value (and dedupe titles defensively).
    const coerced = safePriorities.map((p, idx) => ({
      ...p,
      releasePhase: coercePhase((p as any).releasePhase),
      dependsOn: Array.isArray(p.dependsOn)
        ? p.dependsOn.filter((d): d is string => typeof d === "string")
        : [],
      blocks: Array.isArray(p.blocks)
        ? p.blocks.filter((b): b is string => typeof b === "string")
        : [],
      _seqIdx: idx, // stable tiebreaker for sort
    }));

    // 1. Validate dependsOn references — drop refs to titles that don't exist.
    const validTitles = new Set(coerced.map((p) => p.issue));
    const validated = coerced.map((p) => {
      const kept: string[] = [];
      for (const dep of p.dependsOn) {
        if (validTitles.has(dep)) {
          kept.push(dep);
        } else {
          warnings.push(
            `Priority "${p.issue}" depends on "${dep}" which doesn't exist — dropped`,
          );
        }
      }
      return { ...p, dependsOn: kept };
    });

    // 2. Detect cycles via DFS; if found, break the cycle by removing the
    //    last edge in the cycle path. Repeat until no cycles remain
    //    (a single break may not be enough if there are multiple cycles).
    let cycleGuard = 0;
    let working = validated;
    while (cycleGuard < validated.length + 5) {
      const cyclePath = detectCycle(working);
      if (!cyclePath) break;

      // cyclePath is a list of titles like [A, B, C, A] where A->B->C->A.
      // Break the LAST edge (C -> A): remove "A" from C.dependsOn.
      if (cyclePath.length < 2) break;
      const fromTitle = cyclePath[cyclePath.length - 2];
      const toTitle = cyclePath[cyclePath.length - 1];
      warnings.push(
        `Cycle detected: ${cyclePath.join(" → ")} — breaking by ignoring edge ${fromTitle} → ${toTitle}`,
      );
      working = working.map((p) =>
        p.issue === fromTitle
          ? {
              ...p,
              dependsOn: p.dependsOn.filter((d) => d !== toTitle),
            }
          : p,
      );
      cycleGuard += 1;
    }

    // 3. Topological sort (Kahn's algorithm) — produces a stable order that
    //    respects dependencies. Ties broken by original index for stability.
    const topoOrdered = topoSort(working);

    // 4. releasePhase consistency: if A depends on B, phase(A) >= phase(B).
    //    Promote A (to a LATER phase) when violated — note: "promote" here
    //    means moving it LATER in time, not making it more urgent. A P0 task
    //    that depends on a P2 task is logically impossible; push it to P2.
    const phaseFixed = topoOrdered.map((p) => {
      if (!p.dependsOn || p.dependsOn.length === 0) return p;
      const depPhases = p.dependsOn
        .map((d) => topoOrdered.find((x) => x.issue === d)?.releasePhase)
        .filter((ph): ph is ReleasePhase => Boolean(ph));
      if (depPhases.length === 0) return p;

      const maxDepOrder = Math.max(...depPhases.map((ph) => PHASE_ORDER[ph]));
      const myOrder = PHASE_ORDER[p.releasePhase || DEFAULT_PHASE];
      if (myOrder < maxDepOrder) {
        const newPhase = (
          Object.keys(PHASE_ORDER).find(
            (k) => PHASE_ORDER[k as ReleasePhase] === maxDepOrder,
          ) as ReleasePhase
        );
        warnings.push(
          `Priority "${p.issue}" phase promoted from ${p.releasePhase} to ${newPhase} (depends on later-phase item)`,
        );
        return { ...p, releasePhase: newPhase };
      }
      return p;
    });

    // 5. Final sort: by releasePhase asc, then roiScore desc, then stable idx.
    const finalSorted = phaseFixed
      .slice()
      .sort((a, b) => {
        const pa = PHASE_ORDER[a.releasePhase || DEFAULT_PHASE];
        const pb = PHASE_ORDER[b.releasePhase || DEFAULT_PHASE];
        if (pa !== pb) return pa - pb;
        const ra = typeof a.roiScore === "number" ? a.roiScore : 0;
        const rb = typeof b.roiScore === "number" ? b.roiScore : 0;
        if (rb !== ra) return rb - ra;
        return (a as any)._seqIdx - (b as any)._seqIdx;
      })
      // Strip the internal _seqIdx helper before returning.
      .map(({ ...p }) => {
        delete (p as any)._seqIdx;
        return p;
      });

    // 6. Re-sum effort per phase from the sequenced priorities (the AI's
    //    roadmap estimate may drift from its own priority list). Warn if a
    //    phase exceeds 80h (2 person-weeks) — likely needs splitting.
    const validatedRoadmap = safeRoadmap.map((phase) => {
      const phaseKey = coercePhase(phase.phase);
      const memberEffort = finalSorted
        .filter((p) => (p.releasePhase || DEFAULT_PHASE) === phaseKey)
        .reduce(
          (sum, p) => sum + (typeof p.effortHours === "number" ? p.effortHours : 0),
          0,
        );
      if (memberEffort > 80) {
        warnings.push(
          `Phase ${phaseKey} total effort ${memberEffort}h exceeds 80h (2 person-weeks)`,
        );
      }
      return {
        ...phase,
        phase: phaseKey,
        estimatedEffortHours: memberEffort,
      } as RoadmapPhase;
    });

    return {
      sequencedPriorities: finalSorted,
      sequencedRoadmap: validatedRoadmap,
      warnings,
    };
  } catch (err) {
    // NEVER throw out of sequenceRoadmap — degrade to "pass through input".
    warnings.push(
      `Sequencer internal error: ${
        err instanceof Error ? err.message : String(err)
      } — returning input unmodified`,
    );
    return {
      sequencedPriorities: Array.isArray(priorities) ? priorities : [],
      sequencedRoadmap: Array.isArray(roadmap) ? roadmap : [],
      warnings,
    };
  }
}

/**
 * DFS-based cycle detection. Returns the cycle path (titles, with the start
 * node repeated at the end to close the loop) if found, or null if the
 * dependsOn graph is acyclic.
 *
 *   e.g. if A->B->C->A, returns ["A", "B", "C", "A"]
 */
function detectCycle(priorities: EnhancedPriority[]): string[] | null {
  const titleToDeps = new Map<string, string[]>();
  for (const p of priorities) {
    titleToDeps.set(
      p.issue,
      Array.isArray(p.dependsOn) ? p.dependsOn.slice() : [],
    );
  }

  const WHITE = 0; // unvisited
  const GRAY = 1; // on current DFS stack (in-progress)
  const BLACK = 2; // fully explored — no cycle reachable from here
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  for (const title of titleToDeps.keys()) {
    color.set(title, WHITE);
    parent.set(title, null);
  }

  // Iterative DFS to avoid stack overflow on large priority lists.
  for (const startNode of titleToDeps.keys()) {
    if (color.get(startNode) !== WHITE) continue;

    const stack: Array<{ node: string; depIdx: number }> = [
      { node: startNode, depIdx: 0 },
    ];
    color.set(startNode, GRAY);

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const deps = titleToDeps.get(top.node) || [];
      if (top.depIdx >= deps.length) {
        // Done with this node — mark black and pop.
        color.set(top.node, BLACK);
        stack.pop();
        continue;
      }
      const nextDep = deps[top.depIdx];
      top.depIdx += 1;
      if (!titleToDeps.has(nextDep)) continue; // dep to non-existent node — skip

      const nextColor = color.get(nextDep);
      if (nextColor === GRAY) {
        // Found a back-edge → cycle. Reconstruct path from startNode down
        // to nextDep, then close with nextDep at the end.
        const path: string[] = [];
        for (let i = stack.length - 1; i >= 0; i--) {
          path.unshift(stack[i].node);
          if (stack[i].node === nextDep) break;
        }
        path.push(nextDep); // close the loop
        return path;
      }
      if (nextColor === WHITE) {
        color.set(nextDep, GRAY);
        parent.set(nextDep, top.node);
        stack.push({ node: nextDep, depIdx: 0 });
      }
      // BLACK → already fully explored, skip.
    }
  }
  return null;
}

/**
 * Kahn's algorithm topological sort. Stable: ties broken by insertion order
 * (original priorities[] index) to keep the AI's intended order intact when
 * no dependency forces a different order.
 *
 * Returns a new array; does not mutate input.
 */
function topoSort(priorities: EnhancedPriority[]): EnhancedPriority[] {
  const n = priorities.length;
  if (n === 0) return [];

  // Build adjacency: depTitle -> list of indices that depend on it.
  const titleToIndex = new Map<string, number>();
  priorities.forEach((p, i) => titleToIndex.set(p.issue, i));

  const inDegree = new Array<number>(n).fill(0);
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const deps = priorities[i].dependsOn || [];
    for (const dep of deps) {
      const depIdx = titleToIndex.get(dep);
      if (depIdx === undefined) continue; // shouldn't happen post-validation
      adj[depIdx].push(i); // dep → i
      inDegree[i] += 1;
    }
  }

  // Seed queue with all zero-in-degree nodes, in original index order
  // (stable — keeps AI's intended order when no constraints force otherwise).
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  const result: EnhancedPriority[] = [];
  while (queue.length > 0) {
    const idx = queue.shift()!;
    result.push(priorities[idx]);
    for (const dependentIdx of adj[idx]) {
      inDegree[dependentIdx] -= 1;
      if (inDegree[dependentIdx] === 0) queue.push(dependentIdx);
    }
  }

  // If the graph had a cycle that survived detection (shouldn't happen —
  // detectCycle + break should have removed all cycles), append the
  // remaining nodes in original order so we never lose data.
  if (result.length < n) {
    const included = new Set(result.map((p) => p.issue));
    for (const p of priorities) {
      if (!included.has(p.issue)) result.push(p);
    }
  }

  return result;
}
