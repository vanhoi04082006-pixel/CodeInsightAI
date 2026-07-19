// CodeInsight AI — Debate Orchestrator
// Phase C: Multi-agent debate + consensus for controversial decisions.
//
// When specialist agents disagree (e.g., Security says "don't use eval" but
// Coding says "need eval"), the DebateOrchestrator runs a structured debate
// and the Executive picks the best option based on confidence-weighted voting.
//
// Flow (per `debate()` invocation):
//   1. PROPOSAL phase — each participating agent submits a proposal (or
//      "no opinion") via the LLM, speaking from its specialty.
//   2. OPINION phase — each agent reviews ALL proposals and votes
//      support / oppose / neutral with reasoning + confidence.
//   3. CONSENSUS — `ConsensusEngine` tallies weighted votes and picks a
//      winner; consensus level = % of agents supporting the winner.
//   4. EXECUTIVE DECISION — the Executive reviews the winner + dissenting
//      opinions and either ratifies or overrides (e.g., if the winner has
//      low consensus, the Security agent vetoed it, or its own confidence
//      in the winner is <60%).
//
// Hard limits:
//   - Max 5 debates per mission (configurable via MAX_DEBATES_PER_MISSION).
//   - 3-5 participants per debate (enforced — extra participants are dropped).
//   - No provider → return null (rule-based fallback is intentionally
//     unavailable; debates are an AI-driven feature).
//
// The orchestrator never throws — failures in individual AI calls degrade
// gracefully (the affected agent's proposal/opinion is skipped).

import { callAIForJSON } from "../ai-client";
import type { AIProviderConfig, AIMessage } from "../ai-client";
import { missionEmitter } from "./event-emitter";
import { consensusEngine, type Vote } from "./consensus";
import type { MissionEvent, ExecutiveDecision } from "./types";

// ── Public types ────────────────────────────────────────────────────────────
export interface DebateProposal {
  id: string;
  agentId: string; // who proposed
  proposal: string; // "Use Function constructor instead of eval"
  reasoning: string;
  confidence: number; // 0-100
  tradeoffs: string[]; // ["safer", "but slower"]
}

export interface DebateOpinion {
  agentId: string; // who is opining
  targetProposalId: string; // which proposal they're opining on
  opinion: "support" | "oppose" | "neutral";
  reasoning: string;
  confidence: number; // 0-100
}

export interface DebateResult {
  question: string;
  proposals: DebateProposal[];
  opinions: DebateOpinion[];
  winner: DebateProposal | null;
  consensusLevel: number; // 0-100 (how much agents agree)
  executiveDecision: string; // why Executive chose the winner
  overridden: boolean; // true if Executive overrode the consensus winner
  timestamp: number;
}

export interface DebateContext {
  goal: string;
  memory: string;
  recentActions: string[];
}

// ── Constants ───────────────────────────────────────────────────────────────
const MAX_DEBATES_PER_MISSION = 5;
const MIN_PARTICIPANTS = 3;
const MAX_PARTICIPANTS = 5;
const CONSENSUS_OVERRIDE_THRESHOLD = 50; // <50% consensus → may override
const EXECUTIVE_CONFIDENCE_OVERRIDE_THRESHOLD = 60; // <60% exec confidence → override
const SECURITY_VETO_CONFIDENCE = 60; // Security oppose with ≥60 confidence → veto

// ── Agent role descriptions (used to specialize the proposal prompts) ───────
const AGENT_ROLES: Record<string, string> = {
  "security-agent":
    "You are the Security Agent. Focus on vulnerabilities, injection risks, authentication, secrets handling, and unsafe APIs. Prioritize safety above all else.",
  "performance-agent":
    "You are the Performance Agent. Focus on speed, memory, bundle size, render performance, and algorithmic complexity. Prioritize efficiency.",
  "code-reviewer":
    "You are the Code Reviewer Agent. Focus on readability, maintainability, conventions, naming, dead code, and duplication. Prioritize clarity.",
  "bug-fixer":
    "You are the Bug Fixer Agent. Focus on correctness, edge cases, error handling, and root causes. Prioritize fixing the actual bug, not the symptom.",
  "refactoring-agent":
    "You are the Refactoring Agent. Focus on design patterns, decoupling, cohesion, coupling, and SOLID principles. Prioritize long-term architecture.",
  "test-agent":
    "You are the Test Agent. Focus on testability, coverage, mocks, fixtures, and edge-case discovery. Prioritize verifiability.",
  "devops-agent":
    "You are the DevOps Agent. Focus on deployment, CI/CD, configuration, environments, and infrastructure. Prioritize operability.",
  "documentation-agent":
    "You are the Documentation Agent. Focus on documentation quality, comments, examples, and discoverability. Prioritize clarity for future readers.",
  "repository-analyst":
    "You are the Repository Analyst. Focus on the existing codebase structure, conventions, and what fits naturally with what's already there.",
  planner:
    "You are the Planner Agent. Focus on sequencing, dependencies, and breaking the work into safe, reviewable steps.",
  orchestrator:
    "You are the Executive Agent. Focus on overall mission goal alignment, risk tolerance, and business priorities. Make the final call.",
};

function roleFor(agentId: string): string {
  return (
    AGENT_ROLES[agentId] ??
    `You are the ${agentId} Agent. Contribute your specialty perspective to this debate.`
  );
}

// ── Utility helpers ─────────────────────────────────────────────────────────
function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function clampConfidence(n: unknown, fallback = 50): number {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    if (typeof n === "string") {
      const parsed = parseInt(n, 10);
      if (Number.isFinite(parsed)) return Math.max(0, Math.min(100, parsed));
    }
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(n)));
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function asOpinionKind(value: unknown): "support" | "oppose" | "neutral" {
  if (value === "support" || value === "oppose" || value === "neutral") {
    return value;
  }
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.startsWith("support") || lower.startsWith("agree") || lower.startsWith("endorse")) {
      return "support";
    }
    if (lower.startsWith("oppose") || lower.startsWith("disagree") || lower.startsWith("reject")) {
      return "oppose";
    }
  }
  return "neutral";
}

// ── Build the proposal prompt for an agent ──────────────────────────────────
function buildProposalPrompt(
  agentId: string,
  question: string,
  context: DebateContext,
): AIMessage[] {
  const recentActions =
    context.recentActions.length > 0
      ? context.recentActions.slice(-5).map((a) => `  - ${a}`).join("\n")
      : "  (none yet)";
  const system = `${roleFor(agentId)}

You are participating in a structured multi-agent debate. Speak ONLY from your specialty. If the question is outside your domain, return {"proposal": null}.

Output JSON ONLY (no markdown, no prose):
{
  "proposal": "your concrete recommendation (1-2 sentences), or null if you have no opinion",
  "reasoning": "why you recommend this — be specific about tradeoffs",
  "confidence": 0-100,
  "tradeoffs": ["tradeoff 1", "tradeoff 2"]
}`;

  const user = `MISSION GOAL: ${context.goal}

QUESTION UNDER DEBATE:
${question}

CONTEXT FROM MISSION MEMORY:
${context.memory || "(no relevant memory yet)"}

RECENT ACTIONS TAKEN:
${recentActions}

What is your proposal?`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// ── Build the opinion prompt for an agent reviewing all proposals ───────────
function buildOpinionPrompt(
  agentId: string,
  question: string,
  proposals: DebateProposal[],
  context: DebateContext,
): AIMessage[] {
  const proposalList = proposals
    .map(
      (p, i) =>
        `### Proposal ${i + 1} (id: ${p.id}) — by ${p.agentId} (confidence ${p.confidence}%)
**Recommendation:** ${p.proposal}
**Reasoning:** ${p.reasoning}
**Tradeoffs:** ${p.tradeoffs.length > 0 ? p.tradeoffs.join("; ") : "(none stated)"}`,
    )
    .join("\n\n");

  const system = `${roleFor(agentId)}

You are participating in a structured multi-agent debate. Review each proposal and give your opinion. Speak ONLY from your specialty.

Output JSON ONLY (no markdown, no prose):
{
  "opinions": [
    {
      "targetProposalId": "id of the proposal you're opining on",
      "opinion": "support" | "oppose" | "neutral",
      "reasoning": "why you hold this opinion — 1-2 sentences",
      "confidence": 0-100
    }
  ]
}

You may skip proposals you have no opinion on. Always include your agent specialty in the reasoning.`;

  const user = `MISSION GOAL: ${context.goal}

QUESTION UNDER DEBATE:
${question}

PROPOSALS TO REVIEW:
${proposalList || "(no proposals submitted)"}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// ── Build the Executive decision prompt ────────────────────────────────────
function buildExecutivePrompt(
  question: string,
  proposals: DebateProposal[],
  opinions: DebateOpinion[],
  winner: DebateProposal | null,
  consensusLevel: number,
  context: DebateContext,
): AIMessage[] {
  const proposalLines = proposals
    .map(
      (p) =>
        `- [${p.id}] ${p.agentId} (${p.confidence}%): ${p.proposal} — ${p.reasoning}`,
    )
    .join("\n");
  const opinionLines = opinions
    .map(
      (o) =>
        `- ${o.agentId} on ${o.targetProposalId}: ${o.opinion.toUpperCase()} (${o.confidence}%) — ${o.reasoning}`,
    )
    .join("\n");

  const system = `You are the Executive Agent of CodeInsight AI. Your job is to make the final call on a debated question.

You may either RATIFY the consensus winner or OVERRIDE it. Override only when:
- The winner has low consensus (<50%).
- The Security Agent strongly opposes (≥60% confidence in opposition).
- Your own confidence in the winner is <60%.

Output JSON ONLY (no markdown, no prose):
{
  "decision": "the proposal text you're ratifying (or your alternative)",
  "ratifiedProposalId": "id of the proposal you're ratifying, or null if overriding with a new decision",
  "reasoning": "why you made this call — be specific about which agents you agreed with and why",
  "confidence": 0-100
}`;

  const user = `MISSION GOAL: ${context.goal}

QUESTION UNDER DEBATE:
${question}

PROPOSALS:
${proposalLines}

OPINIONS:
${opinionLines || "(no opinions cast)"}

CONSENSUS WINNER: ${winner ? `${winner.id} (${winner.proposal})` : "(no winner determined)"}
CONSENSUS LEVEL: ${consensusLevel}%

What is your final decision?`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// ── DebateOrchestrator ──────────────────────────────────────────────────────
export class DebateOrchestrator {
  /** Per-mission debate count (capped at MAX_DEBATES_PER_MISSION). */
  private readonly debateCounts = new Map<string, number>();
  /** Per-mission debate history (most recent first). */
  private readonly histories = new Map<string, DebateResult[]>();

  /**
   * Run a debate among selected agents on a question.
   *
   * @returns the DebateResult, or null if:
   *   - no provider is supplied (rule-based fallback unavailable)
   *   - the mission has exceeded its debate cap
   *   - the participants list is empty after sanitization
   *   - no proposals were submitted
   */
  async debate(
    missionId: string,
    question: string,
    participants: string[],
    context: DebateContext,
    provider?: AIProviderConfig,
    signal?: AbortSignal,
  ): Promise<DebateResult | null> {
    // ── Guard: no provider → can't run AI-driven debate ──
    if (!provider) {
      missionEmitter.emit({
        type: "agent:thinking",
        missionId,
        agent: "executive",
        message: `Debate requested on "${question.slice(0, 80)}" but no AI provider configured — skipping.`,
        timestamp: Date.now(),
      });
      return null;
    }

    // ── Guard: debate cap ──
    const count = this.debateCounts.get(missionId) ?? 0;
    if (count >= MAX_DEBATES_PER_MISSION) {
      missionEmitter.emit({
        type: "agent:thinking",
        missionId,
        agent: "executive",
        message: `Debate cap reached (${MAX_DEBATES_PER_MISSION}). Skipping debate on "${question.slice(0, 80)}".`,
        timestamp: Date.now(),
      });
      return null;
    }

    // ── Sanitize participants (3-5, unique, drop empties) ──
    const sanitized = Array.from(new Set(participants.filter((p) => typeof p === "string" && p.length > 0)));
    if (sanitized.length === 0) {
      return null;
    }
    // Ensure the Executive always participates as the final arbiter.
    if (!sanitized.includes("orchestrator")) {
      sanitized.push("orchestrator");
    }
    // Cap at MAX_PARTICIPANTS — keep the Executive + the first N-1 others.
    const trimmed =
      sanitized.length > MAX_PARTICIPANTS
        ? ["orchestrator", ...sanitized.filter((p) => p !== "orchestrator").slice(0, MAX_PARTICIPANTS - 1)]
        : sanitized;
    // Pad to MIN_PARTICIPANTS if needed by duplicating the Executive (rare path).
    const finalParticipants = trimmed.length >= MIN_PARTICIPANTS
      ? trimmed
      : [...trimmed, ...Array(MIN_PARTICIPANTS - trimmed.length).fill("orchestrator")];

    this.debateCounts.set(missionId, count + 1);

    // ── Emit: debate starting ──
    missionEmitter.emit({
      type: "agent:thinking",
      missionId,
      agent: "executive",
      message: `Starting debate #${count + 1} on: "${question.slice(0, 120)}" — participants: ${finalParticipants.join(", ")}`,
      timestamp: Date.now(),
    });
    for (const agentId of finalParticipants) {
      this.emitAgentStatus(missionId, agentId, "thinking", "Preparing proposal");
    }

    // ── 1. PROPOSAL PHASE ────────────────────────────────────────────────
    const proposals: DebateProposal[] = [];
    await Promise.all(
      finalParticipants.map(async (agentId) => {
        try {
          const messages = buildProposalPrompt(agentId, question, context);
          const raw = await callAIForJSON<unknown>(provider, messages, {
            temperature: 0.4,
            maxTokens: 600,
            signal,
          });
          const proposalText = asString(
            (raw as { proposal?: unknown })?.proposal,
          );
          if (!proposalText || proposalText.toLowerCase() === "null") {
            // Agent chose to skip — fine.
            this.emitAgentThinking(
              missionId,
              agentId,
              `${agentId} declined to propose (no opinion on this question).`,
            );
            return;
          }
          const p: DebateProposal = {
            id: genId("proposal"),
            agentId,
            proposal: proposalText,
            reasoning: asString((raw as { reasoning?: unknown })?.reasoning, "(no reasoning provided)"),
            confidence: clampConfidence((raw as { confidence?: unknown })?.confidence, 50),
            tradeoffs: asStringArray((raw as { tradeoffs?: unknown })?.tradeoffs),
          };
          proposals.push(p);
          this.emitAgentThinking(
            missionId,
            agentId,
            `${agentId} proposed: "${p.proposal.slice(0, 140)}" (${p.confidence}% confidence)`,
            p.confidence,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.emitAgentStatus(missionId, agentId, "error", `Proposal failed: ${msg}`);
        }
      }),
    );

    if (proposals.length === 0) {
      // No proposals — nothing to debate.
      missionEmitter.emit({
        type: "agent:thinking",
        missionId,
        agent: "executive",
        message: `Debate ended with no proposals submitted.`,
        timestamp: Date.now(),
      });
      const empty: DebateResult = {
        question,
        proposals: [],
        opinions: [],
        winner: null,
        consensusLevel: 0,
        executiveDecision: "No proposals were submitted — debate inconclusive.",
        overridden: false,
        timestamp: Date.now(),
      };
      this.recordHistory(missionId, empty);
      return empty;
    }

    // ── 2. OPINION PHASE ─────────────────────────────────────────────────
    const opinions: DebateOpinion[] = [];
    for (const agentId of finalParticipants) {
      this.emitAgentStatus(missionId, agentId, "thinking", "Reviewing proposals");
    }
    await Promise.all(
      finalParticipants.map(async (agentId) => {
        try {
          const messages = buildOpinionPrompt(agentId, question, proposals, context);
          const raw = await callAIForJSON<unknown>(provider, messages, {
            temperature: 0.3,
            maxTokens: 800,
            signal,
          });
          const rawOpinions = Array.isArray((raw as { opinions?: unknown })?.opinions)
            ? ((raw as { opinions: unknown[] }).opinions)
            : [];
          for (const op of rawOpinions) {
            if (!op || typeof op !== "object") continue;
            const o = op as Record<string, unknown>;
            const targetId = asString(o.targetProposalId);
            // Only count opinions on proposals that actually exist.
            if (!proposals.some((p) => p.id === targetId)) continue;
            const opinion: DebateOpinion = {
              agentId,
              targetProposalId: targetId,
              opinion: asOpinionKind(o.opinion),
              reasoning: asString(o.reasoning, "(no reasoning provided)"),
              confidence: clampConfidence(o.confidence, 50),
            };
            opinions.push(opinion);
            this.emitAgentThinking(
              missionId,
              agentId,
              `${agentId} → ${opinion.opinion.toUpperCase()} proposal ${targetId.slice(0, 12)} (${opinion.confidence}%): ${opinion.reasoning.slice(0, 120)}`,
              opinion.confidence,
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.emitAgentStatus(missionId, agentId, "error", `Opinion phase failed: ${msg}`);
        }
      }),
    );

    // ── 3. CONSENSUS CALCULATION ────────────────────────────────────────
    const votes: Vote[] = opinions.map((o) => ({
      agentId: o.agentId,
      proposalId: o.targetProposalId,
      opinion: o.opinion,
      confidence: o.confidence,
      weight: consensusEngine.getAgentWeight(o.agentId, question),
    }));

    // Determine winner (or null if no proposals).
    const winnerLike = consensusEngine.determineWinner(proposals, votes);
    const winner: DebateProposal | null = winnerLike
      ? (proposals.find((p) => p.id === winnerLike.id) ?? null)
      : null;
    const consensusLevel = winner
      ? consensusEngine.consensusLevel(winner, votes)
      : 0;

    // ── 4. EXECUTIVE DECISION ───────────────────────────────────────────
    let executiveDecisionText = "";
    let overridden = false;
    let finalWinner = winner;

    // Pre-check: should the Executive override?
    const securityVetoed = winner
      ? this.securityAgentVetoed(winner, opinions)
      : false;
    const shouldOverride =
      winner === null ||
      consensusLevel < CONSENSUS_OVERRIDE_THRESHOLD ||
      securityVetoed;

    try {
      const execMessages = buildExecutivePrompt(
        question,
        proposals,
        opinions,
        winner,
        consensusLevel,
        context,
      );
      const execRaw = await callAIForJSON<unknown>(provider, execMessages, {
        temperature: 0.2,
        maxTokens: 600,
        signal,
      });
      const decisionText = asString(
        (execRaw as { decision?: unknown })?.decision,
        winner ? winner.proposal : "No decision.",
      );
      const ratifiedId = asString((execRaw as { ratifiedProposalId?: unknown })?.ratifiedProposalId);
      const execConfidence = clampConfidence(
        (execRaw as { confidence?: unknown })?.confidence,
        50,
      );
      const execReasoning = asString(
        (execRaw as { reasoning?: unknown })?.reasoning,
        "(no reasoning provided)",
      );

      // Did the Executive override?
      // Override = ratifiedProposalId is null/empty OR it points to a non-winner.
      if (ratifiedId && winner && ratifiedId === winner.id) {
        // Ratified the consensus winner.
        executiveDecisionText = `Ratified consensus winner (${execConfidence}% confidence): ${execReasoning}`;
        overridden = false;
        finalWinner = winner;
      } else if (ratifiedId) {
        // Ratified a different proposal — that's an override.
        const ratifiedProposal = proposals.find((p) => p.id === ratifiedId) ?? null;
        executiveDecisionText = `Overrode consensus winner in favor of ${ratifiedId} (${execConfidence}% confidence): ${execReasoning}`;
        overridden = true;
        finalWinner = ratifiedProposal ?? winner;
      } else {
        // No ratified id — Executive issued a brand new decision.
        executiveDecisionText = `Issued new decision (${execConfidence}% confidence): ${decisionText} — ${execReasoning}`;
        overridden = true;
        finalWinner = winner; // keep the consensus winner as the "official" winner
        // but the executive decision text captures the override.
      }

      // If pre-check said override but Executive ratified anyway, note the
      // disagreement in the decision text.
      if (shouldOverride && !overridden) {
        const reason =
          consensusLevel < CONSENSUS_OVERRIDE_THRESHOLD
            ? `low consensus (${consensusLevel}%)`
            : securityVetoed
              ? "Security Agent veto"
              : "no winner";
        executiveDecisionText += ` [Note: pre-check suggested override due to ${reason}, but Executive chose to ratify.]`;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      executiveDecisionText = `Executive decision phase failed (${msg}). Falling back to consensus winner.`;
      overridden = false;
      finalWinner = winner;
    }

    const result: DebateResult = {
      question,
      proposals,
      opinions,
      winner: finalWinner,
      consensusLevel,
      executiveDecision: executiveDecisionText,
      overridden,
      timestamp: Date.now(),
    };

    // ── Emit final decision as a MissionEvent ──
    const decision: ExecutiveDecision = {
      id: genId("debate_decision"),
      iteration: -1, // debates aren't tied to a specific ReAct iteration
      phase: "decide",
      reasoning: `Debate on "${question.slice(0, 80)}": ${executiveDecisionText}`,
      action: finalWinner
        ? `${finalWinner.proposal.slice(0, 200)} (by ${finalWinner.agentId}, consensus ${consensusLevel}%)`
        : "(no winner)",
      confidence: consensusLevel,
      timestamp: result.timestamp,
    };
    const decisionEvent: MissionEvent = {
      type: "decision",
      missionId,
      decision,
      timestamp: result.timestamp,
    };
    missionEmitter.emit(decisionEvent);

    // Update agent statuses to done.
    for (const agentId of finalParticipants) {
      this.emitAgentStatus(missionId, agentId, "done", "Debate complete");
    }

    this.recordHistory(missionId, result);
    return result;
  }

  /** Get debate history for a mission (oldest first). */
  getHistory(missionId: string): DebateResult[] {
    return this.histories.get(missionId) ?? [];
  }

  /** Number of debates run so far for a mission. */
  getDebateCount(missionId: string): number {
    return this.debateCounts.get(missionId) ?? 0;
  }

  /** Reset all state for a mission (used for cleanup / testing). */
  clear(missionId: string): void {
    this.debateCounts.delete(missionId);
    this.histories.delete(missionId);
  }

  // ── Internal helpers ────────────────────────────────────────────────────
  private recordHistory(missionId: string, result: DebateResult): void {
    const list = this.histories.get(missionId) ?? [];
    list.push(result);
    // Cap history at MAX_DEBATES_PER_MISSION (matches the count cap).
    if (list.length > MAX_DEBATES_PER_MISSION) {
      list.shift();
    }
    this.histories.set(missionId, list);
  }

  private emitAgentThinking(
    missionId: string,
    agentId: string,
    message: string,
    confidence?: number,
  ): void {
    const evt: MissionEvent = {
      type: "agent:thinking",
      missionId,
      agent: agentId,
      message,
      confidence,
      timestamp: Date.now(),
    };
    missionEmitter.emit(evt);
  }

  private emitAgentStatus(
    missionId: string,
    agentId: string,
    status: "idle" | "thinking" | "acting" | "waiting" | "done" | "error",
    detail: string,
  ): void {
    const evt: MissionEvent = {
      type: "agent:status",
      missionId,
      agent: agentId,
      status,
      detail,
      timestamp: Date.now(),
    };
    missionEmitter.emit(evt);
  }

  /**
   * Check if the Security Agent vetoed (opposed with confidence ≥60) the
   * winning proposal.
   */
  private securityAgentVetoed(
    winner: DebateProposal,
    opinions: DebateOpinion[],
  ): boolean {
    return opinions.some(
      (o) =>
        o.agentId === "security-agent" &&
        o.targetProposalId === winner.id &&
        o.opinion === "oppose" &&
        o.confidence >= SECURITY_VETO_CONFIDENCE,
    );
  }
}

/** Process-wide singleton. */
export const debateOrchestrator = new DebateOrchestrator();

// Export constants for testing / observability.
export const DEBATE_LIMITS = {
  MAX_DEBATES_PER_MISSION,
  MIN_PARTICIPANTS,
  MAX_PARTICIPANTS,
  CONSENSUS_OVERRIDE_THRESHOLD,
  EXECUTIVE_CONFIDENCE_OVERRIDE_THRESHOLD,
  SECURITY_VETO_CONFIDENCE,
} as const;
