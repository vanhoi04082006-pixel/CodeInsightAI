// CodeInsight AI — Knowledge Memory (Layer 7, Memory Layer 5)
// Persistent, cross-session learning. Stores learned patterns, past fixes,
// and user conventions in the database (AgentKnowledge table).
//
// v2.0: Replaces the v1 stub. This is a REAL implementation backed by Prisma.

import type {
  KnowledgeMemory as IKnowledgeMemory,
  LearnedPattern,
  PastFix,
  UserConvention,
} from "../contracts";

export class KnowledgeMemoryImpl implements IKnowledgeMemory {
  patterns: LearnedPattern[] = [];
  pastFixes: PastFix[] = [];
  userConventions: UserConvention[] = [];

  private userId: string | null = null;
  private loaded = false;

  /** Set the user ID for scoping knowledge (called by AgentMemory facade). */
  setUserId(userId: string | null): void {
    this.userId = userId;
  }

  /** Load all knowledge entries from the database for the current user. */
  async load(): Promise<void> {
    if (this.loaded) return;
    if (!this.userId) {
      this.loaded = true;
      return;
    }
    try {
      const { db } = await import("@/lib/db");
      const entries = await db.agentKnowledge.findMany({
        where: { userId: this.userId },
        orderBy: { updatedAt: "desc" },
        take: 200, // cap to prevent unbounded memory
      });

      this.patterns = [];
      this.pastFixes = [];
      this.userConventions = [];

      for (const e of entries) {
        if (e.category === "pattern") {
          this.patterns.push({
            id: e.id,
            pattern: e.pattern,
            solution: e.solution,
            confidence: e.confidence,
            occurrenceCount: e.occurrences,
          });
        } else if (e.category === "fix") {
          this.pastFixes.push({
            id: e.id,
            issue: e.pattern,
            approach: e.solution,
            diff: "",
            success: e.success,
            timestamp: e.updatedAt.toISOString(),
          });
        } else if (e.category === "convention") {
          this.userConventions.push({
            id: e.id,
            rule: e.pattern,
            category: e.solution || "general",
          });
        }
      }
      this.loaded = true;
    } catch {
      // DB unavailable (e.g. in test environment) — keep empty arrays.
      this.loaded = true;
    }
  }

  /** Persist all knowledge to the database (upsert per entry). */
  async save(): Promise<void> {
    if (!this.userId) return;
    try {
      const { db } = await import("@/lib/db");
      // Save patterns
      for (const p of this.patterns) {
        await db.agentKnowledge.upsert({
          where: { id: p.id },
          create: {
            id: p.id,
            userId: this.userId,
            category: "pattern",
            pattern: p.pattern,
            solution: p.solution,
            confidence: p.confidence,
            occurrences: p.occurrenceCount,
          },
          update: {
            pattern: p.pattern,
            solution: p.solution,
            confidence: p.confidence,
            occurrences: p.occurrenceCount,
          },
        });
      }
      // Save past fixes
      for (const f of this.pastFixes) {
        await db.agentKnowledge.upsert({
          where: { id: f.id },
          create: {
            id: f.id,
            userId: this.userId,
            category: "fix",
            pattern: f.issue,
            solution: f.approach,
            success: f.success,
          },
          update: {
            pattern: f.issue,
            solution: f.approach,
            success: f.success,
          },
        });
      }
      // Save conventions
      for (const c of this.userConventions) {
        await db.agentKnowledge.upsert({
          where: { id: c.id },
          create: {
            id: c.id,
            userId: this.userId,
            category: "convention",
            pattern: c.rule,
            solution: c.category,
          },
          update: {
            pattern: c.rule,
            solution: c.category,
          },
        });
      }
    } catch {
      // best-effort
    }
  }

  /** Add a learned pattern. */
  addPattern(pattern: LearnedPattern): void {
    // Dedupe by pattern string — increment occurrence count if exists.
    const existing = this.patterns.find((p) => p.pattern === pattern.pattern);
    if (existing) {
      existing.occurrenceCount += 1;
      existing.confidence = Math.min(1, existing.confidence + 0.05);
      existing.solution = pattern.solution || existing.solution;
    } else {
      this.patterns.push({ ...pattern, occurrenceCount: pattern.occurrenceCount || 1 });
    }
  }

  /** Record a past fix attempt. */
  addFix(fix: PastFix): void {
    this.pastFixes.push({ ...fix });
  }

  /** Add a user convention. */
  addConvention(convention: UserConvention): void {
    if (!this.userConventions.some((c) => c.rule === convention.rule)) {
      this.userConventions.push({ ...convention });
    }
  }

  /** Find patterns matching a query string (simple substring match). */
  findPatterns(query: string): LearnedPattern[] {
    const q = query.toLowerCase();
    return this.patterns
      .filter((p) => p.pattern.toLowerCase().includes(q) || p.solution.toLowerCase().includes(q))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
  }

  /** Find past fixes for a similar issue. */
  findFixes(issue: string): PastFix[] {
    const q = issue.toLowerCase();
    return this.pastFixes
      .filter((f) => f.issue.toLowerCase().includes(q))
      .sort((a, b) => (b.success ? 1 : 0) - (a.success ? 1 : 0))
      .slice(0, 5);
  }

  /** Clear all in-memory knowledge (does NOT delete from DB). */
  clear(): void {
    this.patterns = [];
    this.pastFixes = [];
    this.userConventions = [];
    this.loaded = false;
  }
}
