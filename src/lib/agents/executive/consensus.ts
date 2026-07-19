// CodeInsight AI — Consensus Engine
// Phase C: Confidence-weighted voting used by the DebateOrchestrator.
//
// Responsibilities:
//   - Convert agent opinions (support / oppose / neutral) into weighted votes
//   - Tally votes per proposal and pick a winner
//   - Compute a 0-100 consensus level (% of agents supporting the winner)
//   - Apply topic-based weighting so domain experts count more on their turf
//     (Security Agent weighs 2x on security topics, Performance Agent 2x on
//     perf topics, etc.)
//
// The engine is pure (no I/O, no side-effects) so it can be unit-tested in
// isolation. The DebateOrchestrator owns all event emission / AI calls.

import type { AgentId } from "../types";

// ── Public types ────────────────────────────────────────────────────────────
export type OpinionKind = "support" | "oppose" | "neutral";

/**
 * A single agent's vote on a single proposal.
 * `weight` is computed by `ConsensusEngine.getAgentWeight(agentId, topic)` and
 * is multiplied by `confidence` (0-100) and the opinion sign when tallying.
 */
export interface Vote {
  agentId: string;
  proposalId: string;
  opinion: OpinionKind;
  confidence: number; // 0-100
  weight: number; // agent-specific weight for this topic
}

/** Per-proposal tally returned by `tallyVotes`. */
export interface ProposalTally {
  score: number; // weighted sum: Σ(confidence × weight × sign)
  supportCount: number; // raw count of "support" votes
  opposeCount: number; // raw count of "oppose" votes
  neutralCount: number; // raw count of "neutral" votes
  supportWeight: number; // sum of weights for supporters
  opposeWeight: number; // sum of weights for opposers
}

/**
 * Minimal shape the ConsensusEngine needs from a DebateProposal.
 * Importing the full type would create a circular import (debate.ts imports
 * consensus.ts), so we duplicate the structural subset here.
 */
export interface ProposalLike {
  id: string;
  agentId: string;
  proposal: string;
  confidence: number; // 0-100 — the proposer's own confidence
}

// ── Topic detection ─────────────────────────────────────────────────────────
// Maps keywords → the AgentId that should be considered a domain expert on
// that topic. The keyword list is intentionally generous (lower-cased substring
// match) so we don't miss synonyms.

interface TopicRule {
  /** Lower-cased keywords that, if present in the question, flag this topic. */
  keywords: string[];
  /** The agent that should receive the 2x weight boost when this topic fires. */
  agent: AgentId;
}

const TOPIC_RULES: TopicRule[] = [
  {
    agent: "security-agent",
    keywords: [
      "security",
      "vulnerability",
      "vulnerable",
      "xss",
      "csrf",
      "ssrf",
      "injection",
      "sqli",
      "rce",
      "auth",
      "authentication",
      "authorization",
      "secret",
      "credential",
      "crypto",
      "sandbox",
      "eval",
      "unsafe",
      "csp",
      "cors",
    ],
  },
  {
    agent: "performance-agent",
    keywords: [
      "performance",
      "perf",
      "speed",
      "latency",
      "memory",
      "bundle",
      "bundle-size",
      "render",
      "paint",
      "ttfb",
      "fcp",
      "lcp",
      "cls",
      "throughput",
      "cache",
      "memoize",
      "re-render",
      "leak",
    ],
  },
  {
    agent: "test-agent",
    keywords: [
      "test",
      "tests",
      "testing",
      "coverage",
      "unit-test",
      "e2e",
      "integration-test",
      "jest",
      "vitest",
      "playwright",
      "mock",
      "stub",
      "fixture",
    ],
  },
  {
    agent: "refactoring-agent",
    keywords: [
      "architecture",
      "design",
      "pattern",
      "patterns",
      "refactor",
      "restructure",
      "decouple",
      "modular",
      "abstraction",
      "coupling",
      "cohesion",
      "solid",
      "di",
      "dependency-injection",
    ],
  },
  {
    agent: "code-reviewer",
    keywords: [
      "readability",
      "maintainability",
      "style",
      "lint",
      "convention",
      "naming",
      "comment",
      "documentation-quality",
      "dead-code",
      "duplication",
    ],
  },
  {
    agent: "bug-fixer",
    keywords: [
      "bug",
      "bugfix",
      "fix",
      "crash",
      "regression",
      "error",
      "exception",
      "stack-trace",
      "undefined",
      "null-reference",
      "off-by",
      "race-condition",
    ],
  },
  {
    agent: "devops-agent",
    keywords: [
      "deploy",
      "deployment",
      "ci",
      "cd",
      "pipeline",
      "docker",
      "kubernetes",
      "k8s",
      "infra",
      "infrastructure",
      "config",
      "environment",
      "secrets-management",
    ],
  },
];

/**
 * Detect the dominant topic of a question by scanning for keyword matches.
 * Returns the AgentId of the expert that should be weighted 2x, or null if no
 * topic fires (in which case all agents get weight 1).
 *
 * If multiple topics fire, we pick the one with the most keyword hits — this
 * avoids a Security-vs-Performance deadlock when the question touches both.
 */
export function detectTopic(question: string): AgentId | null {
  if (!question) return null;
  const lower = question.toLowerCase();
  let bestAgent: AgentId | null = null;
  let bestHits = 0;
  for (const rule of TOPIC_RULES) {
    let hits = 0;
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) hits++;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestAgent = rule.agent;
    }
  }
  return bestHits > 0 ? bestAgent : null;
}

// ── Engine ──────────────────────────────────────────────────────────────────
const DEFAULT_WEIGHT = 1;
const EXPERT_WEIGHT = 2;

/**
 * Pure voting engine — no I/O, no side-effects. The DebateOrchestrator
 * constructs votes and asks the engine to tally + pick a winner.
 */
export class ConsensusEngine {
  /**
   * Compute the weight of an agent on a given topic.
   *   - The Executive Agent always weighs 1.5x (tie-breaking authority).
   *   - The detected topic expert weighs 2x.
   *   - All other agents weigh 1x.
   *
   * `topic` is the lower-cased question text; pass "" to disable topic boost.
   */
  getAgentWeight(agentId: string, topic: string): number {
    if (agentId === "orchestrator" || agentId === "executive") {
      // Executive has mild tie-breaking authority but doesn't dominate.
      return 1.5;
    }
    const expert = detectTopic(topic);
    if (expert !== null && agentId === expert) {
      return EXPERT_WEIGHT;
    }
    return DEFAULT_WEIGHT;
  }

  /**
   * Tally weighted votes for each proposal.
   * Returns a Map keyed by proposalId with the per-proposal stats.
   *
   * Score formula: Σ(confidence × weight × sign) where
   *   support = +1, oppose = -1, neutral = 0.
   *
   * The score is a real number (not normalized) — callers should compare
   * scores across proposals, not interpret the absolute magnitude.
   */
  tallyVotes(votes: Vote[]): Map<string, ProposalTally> {
    const tallies = new Map<string, ProposalTally>();
    const ensure = (id: string): ProposalTally => {
      let t = tallies.get(id);
      if (!t) {
        t = {
          score: 0,
          supportCount: 0,
          opposeCount: 0,
          neutralCount: 0,
          supportWeight: 0,
          opposeWeight: 0,
        };
        tallies.set(id, t);
      }
      return t;
    };

    for (const v of votes) {
      const t = ensure(v.proposalId);
      const sign = v.opinion === "support" ? 1 : v.opinion === "oppose" ? -1 : 0;
      const contribution = v.confidence * v.weight * sign;
      t.score += contribution;
      if (v.opinion === "support") {
        t.supportCount++;
        t.supportWeight += v.weight;
      } else if (v.opinion === "oppose") {
        t.opposeCount++;
        t.opposeWeight += v.weight;
      } else {
        t.neutralCount++;
      }
    }

    // Round scores to 4 decimal places to avoid float drift surprises.
    for (const t of tallies.values()) {
      t.score = Math.round(t.score * 10_000) / 10_000;
    }
    return tallies;
  }

  /**
   * Determine the winning proposal.
   * Returns null if there are no proposals or no votes (cannot pick a winner
   * from empty input). Ties are broken by:
   *   1. Higher raw score
   *   2. Higher support count (more agents agreed)
   *   3. Higher proposer confidence
   *   4. Lexicographic proposal id (deterministic tiebreaker)
   */
  determineWinner(
    proposals: ProposalLike[],
    votes: Vote[],
  ): ProposalLike | null {
    if (proposals.length === 0) return null;
    if (votes.length === 0) {
      // No votes — fall back to highest-confidence proposal.
      return [...proposals].sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return a.id.localeCompare(b.id);
      })[0];
    }

    const tallies = this.tallyVotes(votes);
    const ranked = [...proposals].sort((a, b) => {
      const ta = tallies.get(a.id);
      const tb = tallies.get(b.id);
      const sa = ta?.score ?? 0;
      const sb = tb?.score ?? 0;
      if (sb !== sa) return sb - sa;
      const supA = ta?.supportCount ?? 0;
      const supB = tb?.supportCount ?? 0;
      if (supB !== supA) return supB - supA;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.id.localeCompare(b.id);
    });
    return ranked[0];
  }

  /**
   * Calculate the consensus level (0-100) for the winning proposal.
   *
   * Defined as: (weighted support for the winner) / (total weighted votes for
   * the winner) × 100, where each agent's contribution is `confidence × weight`.
   * Neutrals count toward the denominator (they participated but didn't
   * endorse) so a winner with many neutrals scores lower than one with mostly
   * supporters.
   *
   * Returns 0 if no votes were cast for the winner.
   */
  consensusLevel(winner: ProposalLike, votes: Vote[]): number {
    const winnerVotes = votes.filter((v) => v.proposalId === winner.id);
    if (winnerVotes.length === 0) return 0;

    let support = 0;
    let total = 0;
    for (const v of winnerVotes) {
      const magnitude = v.confidence * v.weight;
      total += magnitude;
      if (v.opinion === "support") support += magnitude;
      // oppose and neutral contribute to total but not support, lowering
      // the consensus percentage.
    }
    if (total <= 0) return 0;
    const ratio = support / total;
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  }

  /**
   * Convenience: detect whether the Security Agent strongly opposes a proposal.
   * Used by the DebateOrchestrator to decide if the Executive should override
   * the consensus winner.
   *
   * "Strongly opposes" = cast an "oppose" vote with confidence < 30 (low
   * confidence in the winner means the security expert thinks it's risky).
   * Actually, since confidence is on the *opinion*, we check: did the security
   * agent vote "oppose" with high confidence (≥60)?
   */
  securityVeto(winner: ProposalLike, votes: Vote[]): boolean {
    const veto = votes.find(
      (v) =>
        v.agentId === "security-agent" &&
        v.proposalId === winner.id &&
        v.opinion === "oppose" &&
        v.confidence >= 60,
    );
    return veto !== undefined;
  }
}

/** Process-wide singleton. */
export const consensusEngine = new ConsensusEngine();
